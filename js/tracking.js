/**
 * FaceControl — turns front-camera face/eye tracking into a 2D control vector.
 *
 * Uses MediaPipe Face Mesh (with iris refinement) running entirely on-device.
 * Two signals are extracted per frame and blended:
 *   - HEAD: nose position relative to the eye line, normalized by inter-ocular
 *     distance (scale/distance invariant) → captures head yaw/pitch.
 *   - EYES: iris center offset inside each eye box → captures gaze direction.
 *
 * A short calibration captures the user's neutral pose; afterwards
 * `control` is the smoothed, deadzoned offset from neutral in [-1, 1].
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

  class FaceControl {
    constructor(videoEl) {
      this.video = videoEl;
      this.mode = 'both';        // 'head' | 'eyes' | 'both'
      this.sensitivity = 1.5;
      this.smoothing = 0.35;     // EMA factor per frame (higher = snappier)
      this.deadzone = 0.06;

      this.faceVisible = false;
      this.lastFaceTime = 0;
      this.control = { x: 0, y: 0 };   // smoothed output in [-1, 1]

      this._raw = null;                // latest raw measurement
      this._neutral = null;            // calibrated neutral pose
      this._calibSamples = null;
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
    }

    /**
     * Capture the user's neutral pose over `durationMs`.
     * `onProgress(0..1)` drives the calibration UI.
     * Resolves once enough samples are collected; rejects on timeout.
     */
    calibrate(durationMs = 2500, onProgress = null) {
      return new Promise((resolve, reject) => {
        const samples = [];
        const started = performance.now();
        const minSamples = 12;

        this._calibSamples = {
          push: (raw) => {
            samples.push(raw);
            const t = Math.min(1, (performance.now() - started) / durationMs);
            if (onProgress) onProgress(t);
            if (t >= 1 && samples.length >= minSamples) {
              this._calibSamples = null;
              this._neutral = averageRaw(samples);
              this.control = { x: 0, y: 0 };
              resolve();
            }
          },
        };

        const guard = setInterval(() => {
          if (!this._calibSamples) { clearInterval(guard); return; }
          if (performance.now() - started > durationMs + 8000) {
            clearInterval(guard);
            this._calibSamples = null;
            reject(new Error('Could not see your face steadily. Find better lighting and try again.'));
          }
        }, 500);
      });
    }

    get isCalibrated() { return this._neutral !== null; }

    _onResults(results) {
      const lm = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
      if (!lm) {
        this.faceVisible = false;
        // decay toward center when the face is lost so the ball doesn't run away
        this.control.x *= 0.9;
        this.control.y *= 0.9;
        return;
      }

      this.faceVisible = true;
      this.lastFaceTime = performance.now();

      const raw = measure(lm);
      this._raw = raw;

      if (this._calibSamples) {
        this._calibSamples.push(raw);
        return;
      }
      if (!this._neutral) return;

      const n = this._neutral;

      // Head offset from neutral. Yaw ≈ 0.25 units of eye-distance for a
      // comfortable turn, pitch is smaller, so scale to feel symmetric.
      const headX = (raw.headX - n.headX) / 0.25;
      const headY = (raw.headY - n.headY) / 0.18;

      // Gaze offset from neutral. Iris travel inside the eye box is tiny
      // (~0.15 of eye width horizontally, less vertically).
      const gazeX = (raw.gazeX - n.gazeX) / 0.15;
      const gazeY = (raw.gazeY - n.gazeY) / 0.22;

      let cx, cy;
      if (this.mode === 'head') { cx = headX; cy = headY; }
      else if (this.mode === 'eyes') { cx = gazeX; cy = gazeY; }
      else { cx = headX * 0.65 + gazeX * 0.35; cy = headY * 0.65 + gazeY * 0.35; }

      // The camera image is unmirrored: moving/looking to the user's right
      // moves features toward image-left, so flip X for natural control.
      cx = -cx * this.sensitivity;
      cy = cy * this.sensitivity;

      cx = applyDeadzone(clamp(cx, -1, 1), this.deadzone);
      cy = applyDeadzone(clamp(cy, -1, 1), this.deadzone);

      // Exponential smoothing to kill landmark jitter.
      const a = this.smoothing;
      this.control.x += (cx - this.control.x) * a;
      this.control.y += (cy - this.control.y) * a;
    }
  }

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

    // Gaze: iris center within each eye's bounding box, averaged over both eyes.
    const rIris = lm[R_IRIS], lIris = lm[L_IRIS];
    const rTop = lm[R_EYE_TOP], rBot = lm[R_EYE_BOT];
    const lTop = lm[L_EYE_TOP], lBot = lm[L_EYE_BOT];

    const rW = Math.hypot(rInner.x - rOuter.x, rInner.y - rOuter.y) || 1e-6;
    const lW = Math.hypot(lOuter.x - lInner.x, lOuter.y - lInner.y) || 1e-6;
    const rH = Math.abs(rBot.y - rTop.y) || 1e-6;
    const lH = Math.abs(lBot.y - lTop.y) || 1e-6;

    const rGx = (rIris.x - (rOuter.x + rInner.x) / 2) / rW;
    const lGx = (lIris.x - (lInner.x + lOuter.x) / 2) / lW;
    const rGy = (rIris.y - (rTop.y + rBot.y) / 2) / rH;
    const lGy = (lIris.y - (lTop.y + lBot.y) / 2) / lH;

    return {
      headX, headY,
      gazeX: (rGx + lGx) / 2,
      gazeY: (rGy + lGy) / 2,
    };
  }

  function averageRaw(samples) {
    const sum = { headX: 0, headY: 0, gazeX: 0, gazeY: 0 };
    for (const s of samples) {
      sum.headX += s.headX; sum.headY += s.headY;
      sum.gazeX += s.gazeX; sum.gazeY += s.gazeY;
    }
    const k = samples.length;
    return { headX: sum.headX / k, headY: sum.headY / k, gazeX: sum.gazeX / k, gazeY: sum.gazeY / k };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyDeadzone(v, dz) {
    if (Math.abs(v) < dz) return 0;
    // re-scale so output still spans the full [-1, 1] range past the deadzone
    return Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
  }

  window.FaceControl = FaceControl;
})();
