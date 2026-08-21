/**
 * FocusBall: Constellation Weaver — a calm focus-training game.
 *
 * Rest your gaze on a star to light it; light them all to weave the
 * constellation. Levels add structure gradually: any order → follow the
 * glow → numbered order → memory recall → drifting distractor embers.
 * No lives, no game over — mistakes just soften your streak, and every
 * third level ends in a guided breathing interlude.
 *
 * Control is POSITIONAL (tracking.js): your gaze/head offset maps to a
 * spot on screen and the orb glides there.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    streak: document.getElementById('streak'),
    level: document.getElementById('levelPill'),
    trackDot: document.getElementById('trackDot'),
    pauseBtn: document.getElementById('pauseBtn'),
    start: document.getElementById('startScreen'),
    startBtn: document.getElementById('startBtn'),
    startError: document.getElementById('startError'),
    modeSelect: document.getElementById('modeSelect'),
    sensitivity: document.getElementById('sensitivity'),
    calib: document.getElementById('calibScreen'),
    calibTarget: document.getElementById('calibTarget'),
    calibRing: document.getElementById('calibRing'),
    calibStatus: document.getElementById('calibStatus'),
    card: document.getElementById('countdown'),
    cardTitle: document.getElementById('countNum'),
    cardHint: document.getElementById('countHint'),
    breath: document.getElementById('breathScreen'),
    breathCircle: document.getElementById('breathCircle'),
    breathText: document.getElementById('breathText'),
    breathSkip: document.getElementById('breathSkip'),
    pause: document.getElementById('pauseScreen'),
    pauseTitle: document.getElementById('pauseTitle'),
    pauseMsg: document.getElementById('pauseMsg'),
    resumeBtn: document.getElementById('resumeBtn'),
    quitBtn: document.getElementById('quitBtn'),
    over: document.getElementById('overScreen'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScore'),
    sumStats: document.getElementById('sumStats'),
    focusReport: document.getElementById('focusReport'),
    retryBtn: document.getElementById('retryBtn'),
    menuBtn: document.getElementById('menuBtn'),
  };

  const RING_LEN = 326.7;
  const FACE_LOST_PAUSE_MS = 1200;
  const HUD_CLEAR = 58;

  const DWELL_STAR = 0.8;    // seconds of steady gaze to light a star
  const DWELL_DECOY = 0.55;  // seconds on an ember before it counts as a distraction
  const HOVER_GRACE = 0.2;   // seconds of drift allowed before a dwell resets
  const STAR_HIT_R = 40;     // generous gaze-target radius around each star

  // Calibration dots as fractions of the viewport.
  const CAL_POINTS = [
    { key: 'center', x: 0.5, y: 0.5, label: 'Look at the dot' },
    { key: 'left', x: 0.1, y: 0.5, label: 'Follow it left…' },
    { key: 'right', x: 0.9, y: 0.5, label: 'Now right…' },
    { key: 'up', x: 0.5, y: 0.16, label: 'Up…' },
    { key: 'down', x: 0.5, y: 0.84, label: 'And down…' },
  ];

  const MODE_HINTS = {
    free: 'Rest your gaze on each star to light it',
    path: 'Follow the glow from star to star',
    ordered: 'Light the stars in numbered order',
    memory: 'Watch the pattern, then repeat it',
  };

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- tracking

  const tracker = new FaceControl(document.getElementById('camera'));

  // ------------------------------------------------------------- input state

  const kb = { x: 0, y: 0 };
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key);
    if (e.key === ' ' && state === 'playing') pauseGame('Paused');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  const touch = { active: false, x: 0, y: 0 };
  canvas.addEventListener('touchstart', (e) => {
    touch.active = true;
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { touch.active = false; }, { passive: true });

  /** Where the gaze orb should glide, in screen pixels. */
  function readTarget(dt) {
    const r = 12;
    const cxMin = r + 4, cxMax = W - r - 4;
    const cyMin = HUD_CLEAR + r, cyMax = H - r - 4;

    if (touch.active) {
      // aim slightly above the finger so it doesn't cover the target
      return {
        x: clamp(touch.x, cxMin, cxMax),
        y: clamp(touch.y - 50, cyMin, cyMax),
      };
    }

    let c;
    if (game.mode !== 'touch' && tracker.isCalibrated) {
      c = tracker.control;
    } else {
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
      if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
      if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
      kb.x = clamp(kb.x + dx * dt * 2.2, -1, 1);
      kb.y = clamp(kb.y + dy * dt * 2.2, -1, 1);
      c = kb;
    }

    return {
      x: (cxMin + cxMax) / 2 + c.x * (cxMax - cxMin) / 2,
      y: (cyMin + cyMax) / 2 + c.y * (cyMax - cyMin) / 2,
    };
  }

  // --------------------------------------------------------------- game state

  // menu | calibrating | card | playing | flourish | breathing | paused | summary
  let state = 'menu';
  let lastTime = 0;
  let cardT = 0;
  let flourishT = 0;
  let breath = { t: 0, phase: '' };
  let best = 0;
  try { best = Number(localStorage.getItem('focusball.best')) || 0; } catch (e) { /* private mode */ }

  const game = {
    mode: 'both',       // control mode
    level: 1,
    levelMode: 'free',
    score: 0,
    streak: 0,
    bestStreak: 0,
    cursor: { x: 0, y: 0 },
    stars: [],          // {x, y, lit, order, errorT, twinkle}
    seqIndex: 0,        // next star to light (ordered/path/memory)
    litCount: 0,
    phase: 'play',      // 'show' during memory playback, else 'play'
    showTimer: 0,
    decoys: [],
    particles: [],
    bgStars: [],
    nebulae: [],
    dwell: { kind: null, index: -1, t: 0, off: 0 },
    levelMistakes: 0,
    stats: { starsLit: 0, mistakes: 0, distractions: 0, levelsDone: 0, startTime: 0 },
  };

  // expose for automated smoke tests
  window.__fb = { game, get state() { return state; } };

  function makeBackground() {
    game.bgStars = [];
    for (let i = 0; i < 70; i++) {
      game.bgStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }
    game.nebulae = [];
    for (let i = 0; i < 3; i++) {
      game.nebulae.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.min(W, H) * rand(0.35, 0.6),
        hue: [230, 260, 180][i],
        drift: rand(2, 5) * (Math.random() < 0.5 ? -1 : 1),
      });
    }
  }

  // ------------------------------------------------------------ level design

  function levelModeFor(n) {
    if (n <= 2) return 'free';
    if (n <= 4) return 'path';
    if (n <= 6) return 'ordered';
    return 'memory';
  }

  function makeLevel(n) {
    game.levelMode = levelModeFor(n);
    const count = Math.min(8, 3 + Math.floor((n - 1) / 2));

    // scatter stars with a minimum spacing, away from edges and the HUD
    const marginX = W * 0.12;
    const top = HUD_CLEAR + 70, bottom = H - 60;
    const minDist = Math.min(W, H) * (count <= 5 ? 0.24 : 0.19);
    const pts = [];
    let guard = 400;
    while (pts.length < count && guard-- > 0) {
      const p = { x: rand(marginX, W - marginX), y: rand(top, bottom) };
      if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > minDist)) pts.push(p);
    }
    while (pts.length < count) pts.push({ x: rand(marginX, W - marginX), y: rand(top, bottom) });

    // chain stars nearest-neighbor so the constellation reads as a path
    const order = [0];
    const left = new Set(pts.map((_, i) => i).slice(1));
    while (left.size) {
      const last = pts[order[order.length - 1]];
      let bestI = -1, bestD = Infinity;
      for (const i of left) {
        const d = Math.hypot(pts[i].x - last.x, pts[i].y - last.y);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      order.push(bestI);
      left.delete(bestI);
    }

    game.stars = pts.map((p, i) => ({
      x: p.x, y: p.y,
      lit: false,
      order: order.indexOf(i), // position of this star in the sequence
      errorT: 0,
      twinkle: Math.random() * Math.PI * 2,
    }));
    game.seqIndex = 0;
    game.litCount = 0;
    game.levelMistakes = 0;
    game.dwell = { kind: null, index: -1, t: 0, off: 0 };

    // memory levels start by showing the pattern
    game.phase = game.levelMode === 'memory' ? 'show' : 'play';
    game.showTimer = 0;

    // drifting distractor embers from level 9
    game.decoys = [];
    const nDecoys = n >= 9 ? Math.min(3, n - 8) : 0;
    for (let i = 0; i < nDecoys; i++) spawnDecoy();
  }

  function spawnDecoy() {
    const fromLeft = Math.random() < 0.5;
    game.decoys.push({
      x: fromLeft ? -20 : W + 20,
      y: rand(HUD_CLEAR + 60, H - 50),
      vx: (fromLeft ? 1 : -1) * rand(18, 36),
      vy: rand(-8, 8),
      r: 7,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function starBySeq(i) {
    return game.stars.find((s) => s.order === i);
  }

  // ------------------------------------------------------------------ update

  function update(dt) {
    // orb glides toward the gaze point
    const target = readTarget(dt);
    const ease = Math.min(1, dt * 7);
    game.cursor.x += (target.x - game.cursor.x) * ease;
    game.cursor.y += (target.y - game.cursor.y) * ease;

    for (const s of game.stars) {
      s.twinkle += dt * 2;
      if (s.errorT > 0) s.errorT -= dt;
    }

    // memory playback: pulse the sequence, then hand over
    if (game.phase === 'show') {
      game.showTimer += dt;
      const per = 0.7;
      if (game.showTimer > per * game.stars.length + 0.6) game.phase = 'play';
    } else {
      updateDwell(dt);
    }

    // embers drift across the field
    for (const d of game.decoys) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.phase += dt * 4;
    }
    game.decoys = game.decoys.filter((d) => {
      const gone = d.x < -40 || d.x > W + 40;
      if (gone) spawnDecoy();
      return !gone;
    });

    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 1.5;
      p.life -= dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    for (const nb of game.nebulae) {
      nb.x += nb.drift * dt;
      if (nb.x < -nb.r) nb.x = W + nb.r;
      if (nb.x > W + nb.r) nb.x = -nb.r;
    }

    // auto-pause if the face disappears (tracking modes only)
    if (game.mode !== 'touch' && tracker.isCalibrated) {
      const lost = performance.now() - tracker.lastFaceTime > FACE_LOST_PAUSE_MS;
      ui.trackDot.classList.toggle('ok', !lost);
      if (lost && state === 'playing') {
        pauseGame('Face lost', 'Come back into view of the camera, then resume.');
      }
    }

    updateHud();
  }

  function updateDwell(dt) {
    const cx = game.cursor.x, cy = game.cursor.y;

    // nearest actionable target under the gaze
    let kind = null, index = -1, bestD = Infinity;
    game.stars.forEach((s, i) => {
      if (s.lit) return;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < STAR_HIT_R && d < bestD) { bestD = d; kind = 'star'; index = i; }
    });
    game.decoys.forEach((d, i) => {
      const dist = Math.hypot(d.x - cx, d.y - cy);
      if (dist < STAR_HIT_R * 0.8 && dist < bestD) { bestD = dist; kind = 'decoy'; index = i; }
    });

    const dw = game.dwell;
    if (kind === dw.kind && index === dw.index && kind !== null) {
      dw.t += dt;
      dw.off = 0;
    } else if (kind === null && dw.kind !== null && dw.off < HOVER_GRACE) {
      dw.off += dt; // brief drift off-target is forgiven
    } else {
      game.dwell = { kind, index, t: kind ? dt : 0, off: 0 };
      return;
    }

    if (dw.kind === 'star' && dw.t >= DWELL_STAR) {
      lightStar(dw.index);
      game.dwell = { kind: null, index: -1, t: 0, off: 0 };
    } else if (dw.kind === 'decoy' && dw.t >= DWELL_DECOY) {
      distracted(dw.index);
      game.dwell = { kind: null, index: -1, t: 0, off: 0 };
    }
  }

  function lightStar(i) {
    const s = game.stars[i];
    const anyOrder = game.levelMode === 'free';

    if (!anyOrder && s.order !== game.seqIndex) {
      // gentle correction — no punishment beyond the streak
      s.errorT = 0.6;
      game.streak = 0;
      game.levelMistakes += 1;
      game.stats.mistakes += 1;
      if (game.levelMode === 'memory') {
        game.phase = 'show'; // softly replay the pattern
        game.showTimer = 0;
      }
      return;
    }

    s.lit = true;
    game.litCount += 1;
    game.seqIndex += 1;
    game.streak += 1;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    game.stats.starsLit += 1;
    const mult = 1 + Math.min(4, Math.floor(game.streak / 4));
    game.score += 10 * mult;
    burst(s.x, s.y, '#5eead4', 12);
    if (navigator.vibrate) navigator.vibrate(15);

    if (game.litCount >= game.stars.length) completeLevel();
  }

  function distracted(i) {
    const d = game.decoys[i];
    if (!d) return; // decoy may have drifted offscreen this frame
    burst(d.x, d.y, '#fbbf24', 10);
    game.decoys.splice(i, 1);
    spawnDecoy();
    game.streak = 0;
    game.stats.distractions += 1;
  }

  function completeLevel() {
    game.stats.levelsDone += 1;
    game.score += 20 + (game.levelMistakes === 0 ? 50 : 0);
    state = 'flourish';
    flourishT = 1.5;
    for (const s of game.stars) burst(s.x, s.y, '#818cf8', 4);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(40, 160);
      game.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9),
        color,
      });
    }
  }

  // ------------------------------------------------------------------ render

  function render() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1330');
    grad.addColorStop(1, '#0b1020');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // soft nebulae
    for (const nb of game.nebulae) {
      const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
      g.addColorStop(0, `hsla(${nb.hue}, 70%, 60%, 0.06)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    }

    // background twinkle
    for (const s of game.bgStars) {
      ctx.globalAlpha = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(s.tw + performance.now() / 900));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawConstellation();
    drawDecoys();

    // particles
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.9);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawCursor();
  }

  function drawConstellation() {
    const now = performance.now();

    // links between consecutively lit stars
    ctx.save();
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.55)';
    ctx.shadowColor = '#5eead4';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    for (let i = 1; i < game.seqIndex; i++) {
      const a = starBySeq(i - 1), b = starBySeq(i);
      if (!a || !b || !a.lit || !b.lit) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    // memory playback: which star is currently pulsing
    let showIdx = -1;
    if (game.phase === 'show') {
      showIdx = Math.floor(game.showTimer / 0.7);
    }

    game.stars.forEach((s) => {
      const isNext = game.phase === 'play' && !s.lit && s.order === game.seqIndex &&
        game.levelMode === 'path';
      const isShowing = showIdx === s.order;
      const tw = 0.6 + 0.4 * Math.sin(s.twinkle + now / 500);

      ctx.save();
      if (s.lit) {
        ctx.shadowColor = '#5eead4';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#8ff7e4';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // unlit star
        ctx.shadowColor = s.errorT > 0 ? '#fb7185' : '#ffffff';
        ctx.shadowBlur = s.errorT > 0 ? 16 : 8;
        ctx.fillStyle = s.errorT > 0 ? '#fda4af' : `rgba(255,255,255,${0.45 + 0.3 * tw})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // guidance ring: next star in path mode, or during memory playback
        if (isNext || isShowing) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 220);
          ctx.strokeStyle = `rgba(94, 234, 212, ${0.35 + 0.45 * pulse})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = '#5eead4';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 14 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // numbers in ordered mode
        if (game.levelMode === 'ordered') {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(234, 240, 255, 0.85)';
          ctx.font = '600 13px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(s.order + 1), s.x, s.y - 14);
        }
      }
      ctx.restore();

      // dwell progress ring
      const dw = game.dwell;
      if (dw.kind === 'star' && game.stars[dw.index] === s && dw.t > 0.05) {
        const frac = Math.min(1, dw.t / DWELL_STAR);
        ctx.save();
        ctx.strokeStyle = '#5eead4';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#5eead4';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  function drawDecoys() {
    for (const d of game.decoys) {
      const flick = 0.6 + 0.4 * Math.sin(d.phase);
      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(251, 191, 36, ${0.5 + 0.35 * flick})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (0.85 + 0.15 * flick), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const dw = game.dwell;
      if (dw.kind === 'decoy' && game.decoys[dw.index] === d && dw.t > 0.05) {
        const frac = Math.min(1, dw.t / DWELL_DECOY);
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCursor() {
    const { x, y } = game.cursor;
    ctx.save();
    ctx.shadowColor = '#5eead4';
    ctx.shadowBlur = 20;
    const bg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
    bg.addColorStop(0, '#d7fff5');
    bg.addColorStop(1, '#2dd4bf');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------------------- loop

  function frame(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;

    if (state === 'playing') {
      update(dt);
      render();
    } else if (state === 'card') {
      // orb already follows the eyes so the control stays warm
      const target = readTarget(dt);
      const ease = Math.min(1, dt * 7);
      game.cursor.x += (target.x - game.cursor.x) * ease;
      game.cursor.y += (target.y - game.cursor.y) * ease;
      render();
      cardT -= dt;
      if (cardT <= 0) {
        hide(ui.card);
        state = 'playing';
      }
    } else if (state === 'flourish') {
      update(dt);
      render();
      flourishT -= dt;
      if (flourishT <= 0) nextLevel();
    } else if (state === 'breathing') {
      breathe(dt);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // -------------------------------------------------------------- breathing

  function startBreathing() {
    state = 'breathing';
    breath = { t: 0, phase: '' };
    show(ui.breath);
  }

  function breathe(dt) {
    breath.t += dt;
    const cycle = 8; // 4s in, 4s out
    const t = breath.t % cycle;
    const inhale = t < 4;
    const frac = inhale ? t / 4 : 1 - (t - 4) / 4;
    const scale = 0.55 + 0.45 * easeInOut(frac);
    ui.breathCircle.style.transform = `scale(${scale.toFixed(3)})`;
    const label = inhale ? 'Breathe in…' : 'Breathe out…';
    if (label !== breath.phase) {
      breath.phase = label;
      ui.breathText.textContent = label;
    }
    if (breath.t >= cycle * 2) endBreathing(); // two calm cycles
  }

  function endBreathing() {
    hide(ui.breath);
    showLevelCard();
  }

  function easeInOut(t) { return t * t * (3 - 2 * t); }

  // --------------------------------------------------------------------- HUD

  function updateHud() {
    ui.score.textContent = Math.floor(game.score);
    ui.level.textContent = `✦ L${game.level}`;
    const mult = 1 + Math.min(4, Math.floor(game.streak / 4));
    if (mult > 1) {
      ui.streak.textContent = `FOCUS ×${mult}`;
      ui.streak.classList.remove('hidden');
    } else {
      ui.streak.classList.add('hidden');
    }
  }

  // ------------------------------------------------------------ screen flow

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  async function startFlow() {
    game.mode = ui.modeSelect.value;
    tracker.mode = game.mode === 'touch' ? 'both' : game.mode;
    tracker.sensitivity = Number(ui.sensitivity.value);
    hide(ui.startError);

    if (game.mode === 'touch') {
      beginSession();
      return;
    }

    ui.startBtn.disabled = true;
    ui.startBtn.textContent = 'Starting camera…';
    try {
      await tracker.start();
    } catch (err) {
      ui.startBtn.disabled = false;
      ui.startBtn.textContent = 'Start';
      ui.startError.textContent = friendlyCameraError(err);
      show(ui.startError);
      return;
    }
    ui.startBtn.disabled = false;
    ui.startBtn.textContent = 'Start';

    hide(ui.start);
    show(ui.calib);
    runCalibration();
  }

  function placeCalDot(p) {
    ui.calibTarget.style.left = `${p.x * 100}%`;
    ui.calibTarget.style.top = `${p.y * 100}%`;
  }

  async function runCalibration() {
    state = 'calibrating';
    ui.calibRing.style.strokeDashoffset = RING_LEN;
    ui.calibStatus.textContent = 'Looking for your face…';
    placeCalDot(CAL_POINTS[0]);

    const seen = await waitFor(() => tracker.faceVisible, 15000);
    if (!seen) {
      calibrationFailed('No face detected. Check lighting and that the camera isn’t covered.');
      return;
    }

    const points = {};
    try {
      for (const p of CAL_POINTS) {
        ui.calibStatus.textContent = p.label;
        placeCalDot(p);
        await delay(700);
        ui.calibRing.style.strokeDashoffset = RING_LEN;
        points[p.key] = await tracker.samplePoint(1300, (t) => {
          ui.calibRing.style.strokeDashoffset = RING_LEN * (1 - t);
        });
      }
    } catch (err) {
      calibrationFailed(err.message);
      return;
    }

    tracker.setCalibration(points);
    ui.calibStatus.textContent = 'Calibrated ✓';
    setTimeout(() => {
      hide(ui.calib);
      beginSession();
    }, 450);
  }

  function calibrationFailed(msg) {
    hide(ui.calib);
    show(ui.start);
    ui.startError.textContent = msg;
    show(ui.startError);
    tracker.stop();
    state = 'menu';
  }

  function beginSession() {
    game.level = 1;
    game.score = 0;
    game.streak = 0;
    game.bestStreak = 0;
    game.stats = { starsLit: 0, mistakes: 0, distractions: 0, levelsDone: 0, startTime: performance.now() };
    game.cursor.x = W / 2;
    game.cursor.y = H / 2;
    game.particles = [];
    kb.x = 0; kb.y = 0;
    makeBackground();
    makeLevel(game.level);
    hide(ui.start);
    hide(ui.over);
    hide(ui.pause);
    show(ui.hud);
    ui.trackDot.classList.toggle('ok', game.mode === 'touch' || tracker.faceVisible);
    updateHud();
    showLevelCard();
  }

  function nextLevel() {
    game.level += 1;
    makeLevel(game.level);
    updateHud();
    if ((game.level - 1) % 3 === 0 && game.level > 1) startBreathing();
    else showLevelCard();
  }

  function showLevelCard() {
    ui.cardTitle.textContent = `Level ${game.level}`;
    ui.cardHint.textContent = MODE_HINTS[game.levelMode] || '';
    show(ui.card);
    cardT = 2.0;
    lastTime = performance.now();
    state = 'card';
  }

  function pauseGame(title, msg) {
    if (state !== 'playing') return;
    state = 'paused';
    ui.pauseTitle.textContent = title || 'Paused';
    ui.pauseMsg.textContent = msg || 'Take a breath.';
    show(ui.pause);
  }

  function resumeGame() {
    hide(ui.pause);
    lastTime = performance.now();
    state = 'playing';
  }

  function endSession() {
    state = 'summary';
    hide(ui.pause);
    const score = Math.floor(game.score);
    if (score > best) {
      best = score;
      try { localStorage.setItem('focusball.best', String(best)); } catch (e) { /* private mode */ }
      ui.bestScore.textContent = '🏆 New best!';
    } else {
      ui.bestScore.textContent = `Best: ${best}`;
    }
    ui.finalScore.textContent = score;

    const mins = Math.max(1, Math.round((performance.now() - game.stats.startTime) / 60000));
    ui.sumStats.innerHTML = '';
    const rows = [
      ['Levels woven', game.stats.levelsDone],
      ['Stars lit', game.stats.starsLit],
      ['Longest streak', game.bestStreak],
      ['Focused minutes', mins],
    ];
    for (const [k, v] of rows) {
      const div = document.createElement('div');
      div.className = 'sum-row';
      const kEl = document.createElement('span');
      kEl.textContent = k;
      const vEl = document.createElement('strong');
      vEl.textContent = String(v);
      div.append(kEl, vEl);
      ui.sumStats.appendChild(div);
    }

    const total = game.stats.starsLit + game.stats.mistakes;
    const acc = total ? Math.round((game.stats.starsLit / total) * 100) : 100;
    ui.focusReport.textContent =
      acc >= 90 ? `${acc}% precision — calm, deliberate attention. Beautiful.` :
      acc >= 70 ? `${acc}% precision — steady progress. Focus grows with practice.` :
      `${acc}% precision — slow down and let the ring fill. That pause IS the training.`;

    hide(ui.hud);
    show(ui.over);
  }

  function quitToMenu() {
    state = 'menu';
    tracker.stop();
    hide(ui.pause);
    hide(ui.over);
    hide(ui.hud);
    hide(ui.card);
    hide(ui.breath);
    show(ui.start);
  }

  ui.startBtn.addEventListener('click', startFlow);
  ui.pauseBtn.addEventListener('click', () => pauseGame('Paused'));
  ui.resumeBtn.addEventListener('click', resumeGame);
  ui.quitBtn.addEventListener('click', endSession);
  ui.breathSkip.addEventListener('click', endBreathing);
  ui.retryBtn.addEventListener('click', () => {
    if (game.mode === 'touch' || tracker.isCalibrated) beginSession();
    else quitToMenu();
  });
  ui.menuBtn.addEventListener('click', quitToMenu);

  ui.sensitivity.addEventListener('input', () => {
    tracker.sensitivity = Number(ui.sensitivity.value);
  });

  // ------------------------------------------------------------------ helpers

  function friendlyCameraError(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera access was denied. Allow camera access in your browser settings, then reload.';
    }
    if (name === 'NotFoundError') {
      return 'No camera found on this device. Try Touch / Keyboard mode instead.';
    }
    if (location.protocol === 'http:' && location.hostname !== 'localhost') {
      return 'Camera needs a secure (https) connection. Open this page over https.';
    }
    return (err && err.message) || 'Could not start the camera. Try Touch / Keyboard mode.';
  }

  function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function waitFor(cond, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        if (cond()) { clearInterval(iv); resolve(true); }
        else if (performance.now() - t0 > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 100);
    });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
})();
