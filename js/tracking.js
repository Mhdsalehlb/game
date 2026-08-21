/**
 * FaceControl — turns front-camera face/eye tracking into a 2D control vector.
 *
 * Uses MediaPipe Face Mesh (with iris refinement) running entirely on-device.
 * Two signals are extracted per frame and blended by mode:
 *   - HEAD: nose position relative to the eye line, normalized by inter-ocular
 *     distance (scale/distance invariant) → captures head yaw/pitch.
 *   - EYES: iris center offset inside each eye, normalized by eye WIDTH on
 *     both axes (eye height changes with eyelid openness, which made vertical
 *     gaze unstable) → captures gaze direction.
 *
 * The blended signal is calibrated with FIVE points (center + the four screen
 * edges), so each user's real range of motion per direction is learned rather
 * than assumed. Output is filtered with a One Euro filter — heavy smoothing
 * when still, low latency when moving — and `control` ends up in [-1, 1]².
 *
 * Blinks are detected from eyelid openness and gaze is held through them,
 * because iris landmarks spike wildly while the eye is closed.
 */
(function () {
  'use strict';

  // Face Mesh landmark indices
  const NOSE = 1;
  const R_EYE_OUTER = 33, R_EYE_INNER = 133; // subject's right eye
  const L_EYE_INNER = 362, L_EYE_OUTER = 263; // subject's left eye
  const R_EYE_TOP = 159, R_EYE_BOT = 145;
  const L_EYE_TOP = 386, L_EYE_BOT = 374;
  const R_IRIS = 468, L_IRIS = 473; // iris centers (refineLandmarks: true)

  // Eyelid openness (height/width) below this counts as a blink.
  const BLINK_OPENNESS = 0.16;
  // Comfortable full deflections used to pre-scale head/gaze into ~[-1, 1]
  // before blending, so the two signals mix in comparable units.
  const HEAD_X_RANGE = 0.25, HEAD_Y_RANGE = 0.18;
  const GAZE_X_RANGE = 0.14, GAZE_Y_RANGE = 0.10;
  // A calibration extent smaller than this amplifies noise too much — clamp.
  const MIN_EXTENT = 0.14;

  // ---------------------------------------------------------- One Euro filter

  class LowPass {
    constructor() { this.y = null; }
    filter(v, a) {
      this.y = this.y === null ? v : a * v + (1 - a) * this.y;
      return this.y;
    }
  }

  class OneEuro {
    constructor(minCutoff = 0.9, beta = 0.5, dCutoff = 1.0) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.x = new LowPass();
      this.dx = new LowPass();
      this.lastT = null;
    }
    _alpha(cutoff, dt) {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    }
    filter(v, t) {
      if (this.lastT === null) {
        this.lastT = t;
        this.dx.filter(0, 1);
        return this.x.filter(v, 1);
      }
      const dt = Math.max(1e-3, t - this.lastT);
      this.lastT = t;
      const dv = (v - this.x.y) / dt;
      const edv = this.dx.filter(dv, this._alpha(this.dCutoff, dt));
      const cutoff = this.minCutoff + this.beta * Math.abs(edv);
      return this.x.filter(v, this._alpha(cutoff, dt));
    }
    reset() {
      this.x = new LowPass();
      this.dx = new LowPass();
      this.lastT = null;
    }
  }

  // -------------------------------------------------------------- FaceControl

  class FaceControl {
    constructor(videoEl) {
      this.video = videoEl;
      this.mode = 'both';        // 'head' | 'eyes' | 'both'
      this.sensitivity = 1.0;    // scales calibrated control
      this.deadzone = 0.04;

      this.faceVisible = false;
      this.lastFaceTime = 0;
      this.control = { x: 0, y: 0 };   // filtered output in [-1, 1]

      this._cal = null;          // {nx, ny, xLo, xHi, yLo, yHi} in raw units
      this._sampler = null;      // active calibration-point sampler
      this._lastGaze = null;     // gaze held through blinks
      this._rawC = { x: 0, y: 0 };
      this._fx = new OneEuro();
      this._fy = new OneEuro();
      this._faceMesh = null;
      this._camera = null;
      this._running = false;
    }

    /** Request the camera and start the Face Mesh pipeline. */
    async start() {
      if (this._running) return;
      if (typeof FaceMesh === 'undefined') {
        throw new Error('Face tracking library failed to load. Check your connection and reload.');
      }

      this._faceMesh = new FaceMesh({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${f}`,
      });
      this._faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // needed for iris landmarks
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this._faceMesh.onResults((r) => this._onResults(r));

      this._camera = new Camera(this.video, {
        onFrame: async () => {
          if (this._running) await this._faceMesh.send({ image: this.video });
        },
        width: 640,
        height: 480,
        facingMode: 'user',
      });

      this._running = true;
      await this._camera.start();
    }

    stop() {
      this._running = false;
      if (this._camera) {
        try { this._camera.stop(); } catch (e) { /* camera may already be stopped */ }
      }
      const stream = this.video.srcObject;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        this.video.srcObject = null;
      }
      this._camera = null;
      this._cal = null;
      this._lastGaze = null;
    }

    get isCalibrated() { return this._cal !== null; }

    /**
     * Average the blended raw signal for `durationMs` while the user stares at
     * one calibration dot. `onProgress(0..1)` drives the ring UI.
     * Rejects if the face can't be seen steadily.
     */
    samplePoint(durationMs = 1300, onProgress = null) {
      return new Promise((resolve, reject) => {
        const xs = [], ys = [];
        const started = performance.now();
        const minSamples = 8;

        this._sampler = (raw) => {
          xs.push(raw.x);
          ys.push(raw.y);
          const t = Math.min(1, (performance.now() - started) / durationMs);
          if (onProgress) onProgress(t);
          if (t >= 1 && xs.length >= minSamples) {
            this._sampler = null;
            resolve({ x: avg(xs), y: avg(ys) });
          }
        };

        const guard = setInterval(() => {
          if (!this._sampler) { clearInterval(guard); return; }
          if (performance.now() - started > durationMs + 6000) {
            clearInterval(guard);
            this._sampler = null;
            reject(new Error('Could not see your face steadily. Find better lighting and try again.'));
          }
        }, 400);
      });
    }

    /**
     * Install a 5-point calibration. `points` maps screen positions to the
     * raw signal sampled there: {center, left, right, up, down}.
     * left/right/up/down refer to dots at those SCREEN edges, so the mapping
     * learns each user's direction and range — including the camera mirror
     * flip — with no hardcoded signs.
     */
    setCalibration(points) {
      const nx = points.center.x, ny = points.center.y;
      this._cal = {
        nx, ny,
        ...calAxis(nx, points.left.x, points.right.x),
        ...calAxisY(ny, points.up.y, points.down.y),
      };
      this.control = { x: 0, y: 0 };
      this._fx.reset();
      this._fy.reset();
    }

    _weights() {
      if (this.mode === 'head') return { h: 1, g: 0, hy: 1, gy: 0 };
      if (this.mode === 'eyes') return { h: 0, g: 1, hy: 0, gy: 1 };
      // Vertical gaze is the weakest signal, so lean harder on head pitch.
      return { h: 0.6, g: 0.4, hy: 0.72, gy: 0.28 };
    }

    _onResults(results) {
      const lm = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
      if (!lm) {
        this.faceVisible = false;
        // decay toward center when the face is lost so the ball settles
        this.control.x *= 0.92;
        this.control.y *= 0.92;
        return;
      }

      this.faceVisible = true;
      this.lastFaceTime = performance.now();

      const m = measure(lm);

      // Hold the previous gaze through blinks — iris landmarks are garbage
      // while the eye is closed and would fling the ball around.
      let gaze;
      if (m.openness < BLINK_OPENNESS && this._lastGaze) {
        gaze = this._lastGaze;
      } else {
        gaze = { x: m.gazeX, y: m.gazeY };
        this._lastGaze = gaze;
      }

      // Blend head + gaze in comparable pre-scaled units.
      const w = this._weights();
      this._rawC = {
        x: w.h * (m.headX / HEAD_X_RANGE) + w.g * (gaze.x / GAZE_X_RANGE),
        y: w.hy * (m.headY / HEAD_Y_RANGE) + w.gy * (gaze.y / GAZE_Y_RANGE),
      };

      if (this._sampler) {
        this._sampler(this._rawC);
        return;
      }
      if (!this._cal) return;

      const c = this._cal;
      let cx = mapAxis(this._rawC.x, c.nx, c.xLo, c.xHi) * this.sensitivity;
      let cy = mapAxis(this._rawC.y, c.ny, c.yLo, c.yHi) * this.sensitivity;

      cx = applyDeadzone(clamp(cx, -1, 1), this.deadzone);
      cy = applyDeadzone(clamp(cy, -1, 1), this.deadzone);

      const t = performance.now() / 1000;
      this.control.x = clamp(this._fx.filter(cx, t), -1, 1);
      this.control.y = clamp(this._fy.filter(cy, t), -1, 1);
    }
  }

  // ------------------------------------------------------------ measurements

  /** Extract normalized head + gaze measurements from one landmark frame. */
  function measure(lm) {
    const rOuter = lm[R_EYE_OUTER], rInner = lm[R_EYE_INNER];
    const lInner = lm[L_EYE_INNER], lOuter = lm[L_EYE_OUTER];
    const nose = lm[NOSE];

    const eyeMidX = (rOuter.x + lOuter.x) / 2;
    const eyeMidY = (rOuter.y + lOuter.y) / 2;
    const eyeDist = Math.hypot(lOuter.x - rOuter.x, lOuter.y - rOuter.y) || 1e-6;

    // Head pose proxy: nose position relative to the eye line, in eye-distance units.
    const headX = (nose.x - eyeMidX) / eyeDist;
    const headY = (nose.y - eyeMidY) / eyeDist;

    const rIris = lm[R_IRIS], lIris = lm[L_IRIS];
    const rTop = lm[R_EYE_TOP], rBot = lm[R_EYE_BOT];
    const lTop = lm[L_EYE_TOP], lBot = lm[L_EYE_BOT];

    const rW = Math.hypot(rInner.x - rOuter.x, rInner.y - rOuter.y) || 1e-6;
    const lW = Math.hypot(lOuter.x - lInner.x, lOuter.y - lInner.y) || 1e-6;
    const rH = Math.hypot(rBot.x - rTop.x, rBot.y - rTop.y);
    const lH = Math.hypot(lBot.x - lTop.x, lBot.y - lTop.y);

    // Iris offset from the eye-corner midpoint. Both axes are normalized by
    // eye WIDTH: height shrinks whenever the lids move, which used to bleed
    // eyelid motion into vertical gaze.
    const rGx = (rIris.x - (rOuter.x + rInner.x) / 2) / rW;
    const lGx = (lIris.x - (lInner.x + lOuter.x) / 2) / lW;
    const rGy = (rIris.y - (rTop.y + rBot.y) / 2) / rW;
    const lGy = (lIris.y - (lTop.y + lBot.y) / 2) / lW;

    return {
      headX, headY,
      gazeX: (rGx + lGx) / 2,
      gazeY: (rGy + lGy) / 2,
      openness: (rH / rW + lH / lW) / 2,
    };
  }

  // ------------------------------------------------------------- calibration

  /**
   * Build the x-axis calibration from raw values at the screen-left and
   * screen-right dots. If the user barely moved (or moved the same way for
   * both dots), fall back to the default mirrored mapping.
   */
  function calAxis(n, rawAtLeft, rawAtRight) {
    let lo = rawAtLeft - n, hi = rawAtRight - n; // lo → control -1, hi → +1
    const valid = lo * hi < 0 && Math.abs(lo) > 0.03 && Math.abs(hi) > 0.03;
    if (!valid) {
      // camera is unmirrored: user-right = image-left = raw negative
      return { xLo: n + 1, xHi: n - 1 };
    }
    lo = Math.sign(lo) * Math.max(MIN_EXTENT, Math.abs(lo));
    hi = Math.sign(hi) * Math.max(MIN_EXTENT, Math.abs(hi));
    return { xLo: n + lo, xHi: n + hi };
  }

  function calAxisY(n, rawAtUp, rawAtDown) {
    let lo = rawAtUp - n, hi = rawAtDown - n; // up → control -1, down → +1
    const valid = lo * hi < 0 && Math.abs(lo) > 0.03 && Math.abs(hi) > 0.03;
    if (!valid) {
      // image y grows downward, same as screen y — no flip
      return { yLo: n - 1, yHi: n + 1 };
    }
    lo = Math.sign(lo) * Math.max(MIN_EXTENT, Math.abs(lo));
    hi = Math.sign(hi) * Math.max(MIN_EXTENT, Math.abs(hi));
    return { yLo: n + lo, yHi: n + hi };
  }

  /** Piecewise-linear map: raw value → [-1, 1] using per-side calibrated extents. */
  function mapAxis(v, n, lo, hi) {
    const d = v - n;
    const dHi = hi - n, dLo = lo - n;
    if (d === 0 || dHi === 0 || dLo === 0) return 0;
    if (Math.sign(d) === Math.sign(dHi)) return clamp(d / dHi, 0, 1.35);
    return -clamp(d / dLo, 0, 1.35);
  }

  // ----------------------------------------------------------------- helpers

  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyDeadzone(v, dz) {
    if (Math.abs(v) < dz) return 0;
    // re-scale so output still spans the full [-1, 1] range past the deadzone
    return Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
  }

  window.FaceControl = FaceControl;
})();
