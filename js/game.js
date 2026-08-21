/**
 * FocusBall — steer a ball with your eyes/head through moving obstacles.
 * Game engine, screens, and input glue. Tracking lives in tracking.js.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    streak: document.getElementById('streak'),
    lives: document.getElementById('lives'),
    trackDot: document.getElementById('trackDot'),
    pauseBtn: document.getElementById('pauseBtn'),
    start: document.getElementById('startScreen'),
    startBtn: document.getElementById('startBtn'),
    startError: document.getElementById('startError'),
    modeSelect: document.getElementById('modeSelect'),
    sensitivity: document.getElementById('sensitivity'),
    calib: document.getElementById('calibScreen'),
    calibRing: document.getElementById('calibRing'),
    calibStatus: document.getElementById('calibStatus'),
    pause: document.getElementById('pauseScreen'),
    pauseTitle: document.getElementById('pauseTitle'),
    pauseMsg: document.getElementById('pauseMsg'),
    resumeBtn: document.getElementById('resumeBtn'),
    quitBtn: document.getElementById('quitBtn'),
    over: document.getElementById('overScreen'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScore'),
    focusReport: document.getElementById('focusReport'),
    retryBtn: document.getElementById('retryBtn'),
    menuBtn: document.getElementById('menuBtn'),
  };

  const RING_LEN = 326.7; // circumference of the calibration ring
  const FACE_LOST_PAUSE_MS = 1200;

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

  /** Control vector in [-1,1]² from whichever input source is active. */
  function readControl() {
    if (game.mode !== 'touch' && tracker.isCalibrated) {
      return { x: tracker.control.x, y: tracker.control.y };
    }
    let x = 0, y = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) x += 1;
    if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) y += 1;
    if (touch.active) {
      x = clamp((touch.x - game.ball.x) / 80, -1, 1);
      y = clamp((touch.y - game.ball.y) / 80, -1, 1);
    }
    return { x, y };
  }

  // --------------------------------------------------------------- game state

  let state = 'menu'; // menu | calibrating | playing | paused | facelost | over
  let lastTime = 0;
  let best = 0;
  try { best = Number(localStorage.getItem('focusball.best')) || 0; } catch (e) { /* private mode */ }

  const game = {
    mode: 'both',
    ball: { x: 0, y: 0, vx: 0, vy: 0, r: 16 },
    obstacles: [],
    orbs: [],
    particles: [],
    stars: [],
    score: 0,
    lives: 3,
    speed: 150,          // world scroll speed, px/s
    spawnTimer: 0,
    orbTimer: 0,
    invulnUntil: 0,
    time: 0,
    focusTime: 0,        // seconds since last hit
    bestFocusTime: 0,
    multiplier: 1,
  };

  function makeStars() {
    game.stars = [];
    for (let i = 0; i < 60; i++) {
      game.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        depth: Math.random() * 0.6 + 0.2,
      });
    }
  }

  function resetGame() {
    game.ball.x = W * 0.28;
    game.ball.y = H * 0.5;
    game.ball.vx = 0;
    game.ball.vy = 0;
    game.ball.r = Math.max(13, Math.min(W, H) * 0.022);
    game.obstacles = [];
    game.orbs = [];
    game.particles = [];
    game.score = 0;
    game.lives = 3;
    game.speed = 150;
    game.spawnTimer = 1.2;
    game.orbTimer = 2.5;
    game.invulnUntil = 0;
    game.time = 0;
    game.focusTime = 0;
    game.bestFocusTime = 0;
    game.multiplier = 1;
    makeStars();
    updateHud();
  }

  // ---------------------------------------------------------------- obstacles

  function spawnObstacle() {
    const kind = Math.random();
    const speed = game.speed;

    if (kind < 0.4) {
      // Wall with a gap — forces vertical navigation.
      const gap = Math.max(H * 0.24, game.ball.r * 7);
      const gapY = rand(H * 0.12, H * 0.88 - gap);
      const w = rand(34, 54);
      game.obstacles.push(
        { x: W + w, y: 0, w, h: gapY, vx: -speed, vy: 0, kind: 'wall' },
        { x: W + w, y: gapY + gap, w, h: H - gapY - gap, vx: -speed, vy: 0, kind: 'wall' },
      );
    } else if (kind < 0.7) {
      // Free-floating block, slightly faster — forces horizontal timing.
      const s = rand(40, 80);
      game.obstacles.push({
        x: W + s,
        y: rand(H * 0.1, H * 0.9 - s),
        w: s, h: s,
        vx: -speed * rand(1.15, 1.5), vy: 0,
        kind: 'block',
      });
    } else {
      // Drifter — moves up/down while scrolling, forces diagonal dodges.
      const s = rand(36, 64);
      game.obstacles.push({
        x: W + s,
        y: rand(H * 0.2, H * 0.8 - s),
        w: s, h: s,
        vx: -speed * 1.05,
        vy: 0,
        drift: rand(60, 140) * (Math.random() < 0.5 ? -1 : 1),
        phase: Math.random() * Math.PI * 2,
        kind: 'drifter',
      });
    }
  }

  function spawnOrb() {
    game.orbs.push({
      x: W + 20,
      y: rand(H * 0.15, H * 0.85),
      r: 10,
      vx: -game.speed,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ------------------------------------------------------------------ update

  function update(dt) {
    game.time += dt;
    game.focusTime += dt;
    game.bestFocusTime = Math.max(game.bestFocusTime, game.focusTime);

    // focus multiplier grows the longer you fly clean
    game.multiplier = 1 + Math.min(4, Math.floor(game.focusTime / 10));

    // difficulty ramp
    game.speed = 150 + Math.min(260, game.time * 6);

    // ball physics: control sets target velocity, eased for weight
    const c = readControl();
    const maxSpeed = Math.min(W, H) * 0.85;
    game.ball.vx += (c.x * maxSpeed - game.ball.vx) * Math.min(1, dt * 6);
    game.ball.vy += (c.y * maxSpeed - game.ball.vy) * Math.min(1, dt * 6);
    game.ball.x += game.ball.vx * dt;
    game.ball.y += game.ball.vy * dt;

    const r = game.ball.r;
    game.ball.x = clamp(game.ball.x, r, W - r);
    game.ball.y = clamp(game.ball.y, r + 54, H - r); // keep clear of the HUD

    // spawn cadence tightens as speed rises
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnObstacle();
      game.spawnTimer = rand(0.9, 1.6) * (150 / game.speed) + 0.35;
    }
    game.orbTimer -= dt;
    if (game.orbTimer <= 0) {
      spawnOrb();
      game.orbTimer = rand(3, 6);
    }

    // move obstacles
    for (const o of game.obstacles) {
      o.x += o.vx * dt;
      if (o.kind === 'drifter') {
        o.phase += dt * 2;
        o.y += Math.sin(o.phase) * o.drift * dt;
        o.y = clamp(o.y, 0, H - o.h);
      }
    }
    game.obstacles = game.obstacles.filter((o) => o.x + o.w > -10);

    // orbs drift and bob
    for (const orb of game.orbs) {
      orb.x += orb.vx * dt;
      orb.phase += dt * 3;
    }
    game.orbs = game.orbs.filter((o) => o.x > -30);

    // scoring: survival + orbs, scaled by focus multiplier
    game.score += dt * 10 * game.multiplier;

    // collisions
    const now = performance.now();
    if (now > game.invulnUntil) {
      for (const o of game.obstacles) {
        if (circleRectHit(game.ball, o)) {
          hitObstacle();
          break;
        }
      }
    }

    for (let i = game.orbs.length - 1; i >= 0; i--) {
      const orb = game.orbs[i];
      const bobY = orb.y + Math.sin(orb.phase) * 6;
      if (Math.hypot(orb.x - game.ball.x, bobY - game.ball.y) < orb.r + game.ball.r) {
        game.orbs.splice(i, 1);
        game.score += 50 * game.multiplier;
        burst(orb.x, bobY, '#5eead4', 14);
      }
    }

    // particles
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    // stars parallax
    for (const s of game.stars) {
      s.x -= game.speed * s.depth * dt * 0.3;
      if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H; }
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

  function hitObstacle() {
    game.lives -= 1;
    game.invulnUntil = performance.now() + 1600;
    game.focusTime = 0;
    burst(game.ball.x, game.ball.y, '#fb7185', 22);
    if (navigator.vibrate) navigator.vibrate(80);
    updateHud();
    if (game.lives <= 0) endGame();
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 260);
      game.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        color,
      });
    }
  }

  // ------------------------------------------------------------------ render

  function render() {
    // background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1330');
    grad.addColorStop(1, '#0b1020');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const s of game.stars) {
      ctx.globalAlpha = 0.25 + s.depth * 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // orbs
    for (const orb of game.orbs) {
      const y = orb.y + Math.sin(orb.phase) * 6;
      ctx.save();
      ctx.shadowColor = '#5eead4';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#5eead4';
      ctx.beginPath();
      ctx.arc(orb.x, y, orb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // obstacles
    for (const o of game.obstacles) {
      const isWall = o.kind === 'wall';
      ctx.save();
      ctx.shadowColor = isWall ? '#818cf8' : '#f472b6';
      ctx.shadowBlur = 12;
      ctx.fillStyle = isWall ? 'rgba(129,140,248,0.9)' : 'rgba(244,114,182,0.85)';
      roundRect(o.x, o.y, o.w, o.h, Math.min(10, o.w / 3));
      ctx.fill();
      ctx.restore();
    }

    // particles
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.7);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ball (blinks while invulnerable)
    const blinking = performance.now() < game.invulnUntil;
    if (!blinking || Math.floor(performance.now() / 120) % 2 === 0) {
      ctx.save();
      ctx.shadowColor = '#5eead4';
      ctx.shadowBlur = 24;
      const bg = ctx.createRadialGradient(
        game.ball.x - game.ball.r * 0.3, game.ball.y - game.ball.r * 0.3, 2,
        game.ball.x, game.ball.y, game.ball.r,
      );
      bg.addColorStop(0, '#d7fff5');
      bg.addColorStop(1, '#2dd4bf');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(game.ball.x, game.ball.y, game.ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // -------------------------------------------------------------------- loop

  function frame(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;
    if (state === 'playing') {
      update(dt);
      render();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --------------------------------------------------------------------- HUD

  function updateHud() {
    ui.score.textContent = Math.floor(game.score);
    ui.lives.textContent = '❤️'.repeat(Math.max(0, game.lives)) || '💔';
    if (game.multiplier > 1) {
      ui.streak.textContent = `FOCUS ×${game.multiplier}`;
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
      beginPlay();
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

  async function runCalibration() {
    ui.calibRing.style.strokeDashoffset = RING_LEN;
    ui.calibStatus.textContent = 'Looking for your face…';

    // wait until the face is actually visible before sampling
    const seen = await waitFor(() => tracker.faceVisible, 15000);
    if (!seen) {
      calibrationFailed('No face detected. Check lighting and that the camera isn’t covered.');
      return;
    }

    ui.calibStatus.textContent = 'Hold still and look at the dot…';
    try {
      await tracker.calibrate(2500, (t) => {
        ui.calibRing.style.strokeDashoffset = RING_LEN * (1 - t);
      });
    } catch (err) {
      calibrationFailed(err.message);
      return;
    }

    ui.calibStatus.textContent = 'Calibrated ✓';
    setTimeout(() => {
      hide(ui.calib);
      beginPlay();
    }, 500);
  }

  function calibrationFailed(msg) {
    hide(ui.calib);
    show(ui.start);
    ui.startError.textContent = msg;
    show(ui.startError);
    tracker.stop();
  }

  function beginPlay() {
    resetGame();
    hide(ui.start);
    hide(ui.over);
    hide(ui.pause);
    show(ui.hud);
    ui.trackDot.classList.toggle('ok', game.mode === 'touch' || tracker.faceVisible);
    state = 'playing';
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

  function endGame() {
    state = 'over';
    const score = Math.floor(game.score);
    if (score > best) {
      best = score;
      try { localStorage.setItem('focusball.best', String(best)); } catch (e) { /* private mode */ }
      ui.bestScore.textContent = '🏆 New best!';
    } else {
      ui.bestScore.textContent = `Best: ${best}`;
    }
    ui.finalScore.textContent = score;
    ui.focusReport.textContent =
      `Longest focus streak: ${Math.floor(game.bestFocusTime)}s without a hit. ` +
      (game.bestFocusTime >= 30 ? 'Excellent sustained attention!' :
       game.bestFocusTime >= 15 ? 'Solid focus — keep training.' :
       'Short sessions daily build steadier focus.');
    hide(ui.hud);
    show(ui.over);
  }

  function quitToMenu() {
    state = 'menu';
    tracker.stop();
    hide(ui.pause);
    hide(ui.over);
    hide(ui.hud);
    show(ui.start);
  }

  ui.startBtn.addEventListener('click', startFlow);
  ui.pauseBtn.addEventListener('click', () => pauseGame('Paused'));
  ui.resumeBtn.addEventListener('click', resumeGame);
  ui.quitBtn.addEventListener('click', quitToMenu);
  ui.retryBtn.addEventListener('click', () => {
    // camera/calibration are still live — jump straight back in
    if (game.mode === 'touch' || tracker.isCalibrated) beginPlay();
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

  function waitFor(cond, timeoutMs) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        if (cond()) { clearInterval(iv); resolve(true); }
        else if (performance.now() - t0 > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 100);
    });
  }

  function circleRectHit(ball, rect) {
    const cx = clamp(ball.x, rect.x, rect.x + rect.w);
    const cy = clamp(ball.y, rect.y, rect.y + rect.h);
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    // shrink the hitbox slightly so grazing feels fair
    return dx * dx + dy * dy < (ball.r * 0.85) * (ball.r * 0.85);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
})();
