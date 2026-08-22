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
  const PAL = () => window.StargazeTheme.palette;
  const CFG = window.STARGAZE_CONFIG || {};

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
    recalBtn: document.getElementById('recalBtn'),
    unlock: document.getElementById('unlockScreen'),
    unlockMsg: document.getElementById('unlockMsg'),
    unlockPrice: document.getElementById('unlockPrice'),
    buyBtn: document.getElementById('buyBtn'),
    licenseInput: document.getElementById('licenseInput'),
    licenseBtn: document.getElementById('licenseBtn'),
    unlockError: document.getElementById('unlockError'),
    unlockLaterBtn: document.getElementById('unlockLaterBtn'),
    challengeBanner: document.getElementById('challengeBanner'),
    challengeShareBtn: document.getElementById('challengeShareBtn'),
    card: document.getElementById('countdown'),
    cardPre: document.getElementById('cardPre'),
    cardTitle: document.getElementById('countNum'),
    cardHint: document.getElementById('countHint'),
    factCard: document.getElementById('factCard'),
    factTitle: document.getElementById('factTitle'),
    factText: document.getElementById('factText'),
    calibDots: document.getElementById('calibDots'),
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
  const STAR_HIT_R = 40;     // max gaze-target radius (shrunk when stars sit close)
  const SKY = window.STARGAZE_SKY || [];

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

  // menu | calibrating | warmup | card | playing | flourish | breathing | paused | unlock | summary
  let state = 'menu';
  let lastTime = 0;
  let cardT = 0;
  let flourishT = 0;
  let breath = { t: 0, phase: '' };
  const WARMUP_R = 44, WARMUP_HOLD = 0.6, WARMUP_TIMEOUT = 18;
  const warmup = { target: { x: 0, y: 0 }, inT: 0, t: 0 };
  let challengeDone = false; // a challenge link plays once, then normal sessions
  let lastShare = null;      // {constellation, acc} for "Challenge a friend"
  let best = 0;
  try { best = Number(localStorage.getItem('stargaze.best')) || 0; } catch (e) { /* private mode */ }

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

  // rotate through the constellations of each size so repeats vary
  const skyCursor = {};

  function pickConstellation(count) {
    const pool = SKY.filter((c) => c.count === count);
    if (!pool.length) return SKY[SKY.length - 1];
    skyCursor[count] = (skyCursor[count] || 0) % pool.length;
    return pool[skyCursor[count]++];
  }

  // ---- challenge links: app.html?c=<constellation>&p=<precision> ----

  const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const challenge = (() => {
    const q = new URLSearchParams(location.search);
    const c = SKY.find((k) => slugOf(k.name) === q.get('c'));
    if (!c) return null;
    const p = Math.min(100, Math.max(0, Math.round(Number(q.get('p'))))) || null;
    return { constellation: c, targetP: p };
  })();

  function makeLevel(n, forced) {
    game.levelMode = forced ? 'ordered' : levelModeFor(n);
    const count = Math.min(8, 3 + Math.floor((n - 1) / 2));
    const c = forced || pickConstellation(count);
    game.constellation = c;

    // fit the constellation's canonical shape to the playfield,
    // preserving its aspect so the real sky pattern stays recognizable
    const marginX = W * 0.13;
    const top = HUD_CLEAR + 80, bottom = H - 70;
    const availW = W - marginX * 2, availH = bottom - top;
    const xs = c.stars.map((s) => s.x), ys = c.stars.map((s) => s.y);
    const bw = Math.max(0.05, Math.max(...xs) - Math.min(...xs));
    const bh = Math.max(0.05, Math.max(...ys) - Math.min(...ys));
    const scale = Math.min(availW / bw, availH / bh);
    const ox = marginX + (availW - bw * scale) / 2 - Math.min(...xs) * scale;
    const oy = top + (availH - bh * scale) / 2 - Math.min(...ys) * scale;

    game.stars = c.stars.map((s, i) => ({
      x: ox + s.x * scale,
      y: oy + s.y * scale,
      name: s.name,
      lit: false,
      order: i, // traditional line-drawing order from the sky data
      errorT: 0,
      twinkle: Math.random() * Math.PI * 2,
    }));

    // shrink the gaze radius when the real shape puts stars close together
    let minD = Infinity;
    for (let i = 0; i < game.stars.length; i++) {
      for (let j = i + 1; j < game.stars.length; j++) {
        minD = Math.min(minD, Math.hypot(
          game.stars[i].x - game.stars[j].x, game.stars[i].y - game.stars[j].y));
      }
    }
    game.hitR = Math.max(24, Math.min(STAR_HIT_R, minD / 2 - 6));
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
    const hitR = game.hitR || STAR_HIT_R;
    game.stars.forEach((s, i) => {
      if (s.lit) return;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d < hitR && d < bestD) { bestD = d; kind = 'star'; index = i; }
    });
    game.decoys.forEach((d, i) => {
      const dist = Math.hypot(d.x - cx, d.y - cy);
      if (dist < hitR * 0.8 && dist < bestD) { bestD = dist; kind = 'decoy'; index = i; }
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
    burst(s.x, s.y, PAL().particleStar, 12);
    if (navigator.vibrate) navigator.vibrate(15);

    if (game.litCount >= game.stars.length) completeLevel();
  }

  function distracted(i) {
    const d = game.decoys[i];
    if (!d) return; // decoy may have drifted offscreen this frame
    burst(d.x, d.y, PAL().decoyGlow, 10);
    game.decoys.splice(i, 1);
    spawnDecoy();
    game.streak = 0;
    game.stats.distractions += 1;
  }

  function completeLevel() {
    game.stats.levelsDone += 1;
    game.score += 20 + (game.levelMistakes === 0 ? 50 : 0);
    state = 'flourish';
    flourishT = 4.2; // long enough to read the constellation's story
    for (const s of game.stars) burst(s.x, s.y, PAL().particleLevel, 4);
    if (game.constellation) {
      ui.factTitle.textContent = `✦ ${game.constellation.name}`;
      ui.factText.textContent = game.constellation.fact;
      show(ui.factCard);
    }
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
    const p = PAL();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, p.bgTop);
    grad.addColorStop(1, p.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // soft nebulae
    game.nebulae.forEach((nb, i) => {
      const hue = p.nebulaHues[i % p.nebulaHues.length];
      const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
      g.addColorStop(0, `hsla(${hue}, 55%, 55%, ${p.nebulaAlpha})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    });

    // background twinkle
    for (const s of game.bgStars) {
      const a = 0.2 + 0.28 * (0.5 + 0.5 * Math.sin(s.tw + performance.now() / 900));
      ctx.fillStyle = `rgba(${p.bgStar}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

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

  /** Background, nebulae, and twinkling stars only — used behind calibration. */
  function renderAmbient() {
    const p = PAL();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, p.bgTop);
    grad.addColorStop(1, p.bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    game.nebulae.forEach((nb, i) => {
      const hue = p.nebulaHues[i % p.nebulaHues.length];
      const g = ctx.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
      g.addColorStop(0, `hsla(${hue}, 55%, 55%, ${p.nebulaAlpha})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    });
    for (const s of game.bgStars) {
      const a = 0.2 + 0.28 * (0.5 + 0.5 * Math.sin(s.tw + performance.now() / 900));
      ctx.fillStyle = `rgba(${p.bgStar}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawConstellation() {
    const now = performance.now();
    const p = PAL();

    // links between consecutively lit stars
    ctx.save();
    ctx.strokeStyle = p.link;
    ctx.shadowColor = p.linkGlow;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.8;
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
        ctx.shadowColor = p.litGlow;
        ctx.shadowBlur = 16;
        ctx.fillStyle = p.starLit;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // unlit star
        ctx.shadowColor = s.errorT > 0 ? p.starError : `rgb(${p.starUnlit})`;
        ctx.shadowBlur = s.errorT > 0 ? 16 : 7;
        ctx.fillStyle = s.errorT > 0 ? p.starError : `rgba(${p.starUnlit}, ${(0.5 + 0.3 * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // guidance ring: next star in path mode, or during memory playback
        if (isNext || isShowing) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 260);
          ctx.strokeStyle = `rgba(${p.hint}, ${(0.35 + 0.4 * pulse).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = `rgb(${p.hint})`;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 14 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // numbers in ordered mode
        if (game.levelMode === 'ordered') {
          ctx.shadowBlur = 0;
          ctx.fillStyle = p.text;
          ctx.font = '600 13px Inter, -apple-system, sans-serif';
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
        ctx.strokeStyle = p.starLit;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = p.litGlow;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 18, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // a lit star reveals its real name — small reward, small lesson
      if (s.name && (s.lit || isShowing)) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.text;
        ctx.globalAlpha = s.lit ? 0.75 : 0.55;
        ctx.font = 'italic 500 12.5px "Cormorant Garamond", Georgia, serif';
        ctx.textAlign = 'center';
        const below = s.y < H - 60;
        ctx.fillText(s.name, s.x, below ? s.y + 27 : s.y - 22);
        ctx.restore();
      }
    });
  }

  function drawDecoys() {
    const p = PAL();
    for (const d of game.decoys) {
      const flick = 0.6 + 0.4 * Math.sin(d.phase);
      ctx.save();
      ctx.shadowColor = p.decoyGlow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `rgba(${p.decoy}, ${(0.45 + 0.3 * flick).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (0.85 + 0.15 * flick), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const dw = game.dwell;
      if (dw.kind === 'decoy' && game.decoys[dw.index] === d && dw.t > 0.05) {
        const frac = Math.min(1, dw.t / DWELL_DECOY);
        ctx.save();
        ctx.strokeStyle = p.decoyGlow;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCursor() {
    const p = PAL();
    const { x, y } = game.cursor;
    ctx.save();
    ctx.shadowColor = p.cursorGlow;
    ctx.shadowBlur = 18;
    const bg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
    bg.addColorStop(0, p.cursorIn);
    bg.addColorStop(1, p.cursorOut);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Post-calibration warm-up: glide the orb into a ring to prove control. */
  function drawWarmup() {
    const p = PAL();
    const t = warmup.target;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.strokeStyle = `rgba(${p.hint}, ${(0.5 + 0.3 * pulse).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `rgb(${p.hint})`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(t.x, t.y, WARMUP_R + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();

    if (warmup.inT > 0.03) {
      const frac = Math.min(1, warmup.inT / WARMUP_HOLD);
      ctx.strokeStyle = p.starLit;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(t.x, t.y, WARMUP_R + 10, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = p.text;
    ctx.font = '500 16px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Glide your orb into the ring', W / 2, Math.max(HUD_CLEAR + 40, t.y - WARMUP_R - 40));
    ctx.restore();
  }

  // -------------------------------------------------------------------- loop

  function frame(t) {
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0);
    lastTime = t;

    if (state === 'playing') {
      update(dt);
      render();
    } else if (state === 'calibrating') {
      // a living sky behind the calibration keeps the moment calm
      for (const nb of game.nebulae) {
        nb.x += nb.drift * dt;
        if (nb.x < -nb.r) nb.x = W + nb.r;
        if (nb.x > W + nb.r) nb.x = -nb.r;
      }
      renderAmbient();
    } else if (state === 'warmup') {
      const target = readTarget(dt);
      const ease = Math.min(1, dt * 7);
      game.cursor.x += (target.x - game.cursor.x) * ease;
      game.cursor.y += (target.y - game.cursor.y) * ease;
      render();
      drawWarmup();
      warmup.t += dt;
      const d = Math.hypot(game.cursor.x - warmup.target.x, game.cursor.y - warmup.target.y);
      warmup.inT = d < WARMUP_R ? warmup.inT + dt : 0;
      if (warmup.inT >= WARMUP_HOLD || warmup.t >= WARMUP_TIMEOUT) {
        if (warmup.mid) { lastTime = t; state = 'playing'; }
        else showLevelCard();
      }
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
    hide(ui.factCard);
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
    ui.startBtn.textContent = 'Begin';

    if (!game.bgStars.length) makeBackground();
    hide(ui.start);
    show(ui.calib);
    runCalibration();
  }

  function renderCalibDots(activeIdx, doneCount) {
    ui.calibDots.innerHTML = '';
    for (let i = 0; i < CAL_POINTS.length; i++) {
      const d = document.createElement('span');
      d.className = 'calib-progress-dot' +
        (i < doneCount ? ' done' : i === activeIdx ? ' active' : '');
      ui.calibDots.appendChild(d);
    }
  }

  function placeCalDot(p) {
    ui.calibTarget.style.left = `${p.x * 100}%`;
    ui.calibTarget.style.top = `${p.y * 100}%`;
  }

  /**
   * Verified calibration: each edge point is checked against the center
   * sample — the signal must actually move, mostly along the right axis,
   * before we advance. A point that doesn't verify is retried with
   * clearer guidance, so a bad calibration can't silently continue.
   */
  const POINT_TIPS = {
    left: 'Really look at the far left dot — eyes (and head) toward it.',
    right: 'Look all the way to the right dot.',
    up: 'Lift your gaze up to the dot.',
    down: 'Drop your gaze down to the dot.',
  };

  function pointVerifies(key, sample, center) {
    if (key === 'center') return true;
    const dx = sample.x - center.x, dy = sample.y - center.y;
    const horizontal = key === 'left' || key === 'right';
    const main = horizontal ? Math.abs(dx) : Math.abs(dy);
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
    return main >= 0.1 && main >= cross * 0.8;
  }

  async function samplePointUI(p) {
    ui.calibStatus.textContent = p.label;
    placeCalDot(p);
    await delay(750);
    ui.calibRing.style.strokeDashoffset = RING_LEN;
    return tracker.samplePoint(1300, (t) => {
      ui.calibRing.style.strokeDashoffset = RING_LEN * (1 - t);
    });
  }

  async function runCalibration() {
    state = 'calibrating';
    if (!game.bgStars.length) makeBackground();
    ui.calibRing.style.strokeDashoffset = RING_LEN;
    ui.calibStatus.textContent = 'Looking for your face…';
    renderCalibDots(-1, 0);
    placeCalDot(CAL_POINTS[0]);

    const seen = await waitFor(() => tracker.faceVisible, 15000);
    if (!seen) {
      calibrationFailed('No face detected. Check lighting and that the camera isn’t covered.');
      return;
    }

    const points = {};
    const MAX_TRIES = 3;
    try {
      for (let idx = 0; idx < CAL_POINTS.length; idx++) {
        const p = CAL_POINTS[idx];
        renderCalibDots(idx, idx);
        let ok = false;
        for (let attempt = 1; attempt <= MAX_TRIES && !ok; attempt++) {
          if (attempt > 1) {
            ui.calibStatus.textContent = `Almost — ${POINT_TIPS[p.key] || p.label}`;
            await delay(900);
          }
          const sample = await samplePointUI(p);
          if (pointVerifies(p.key, sample, points.center)) {
            points[p.key] = sample;
            ok = true;
            ui.calibStatus.textContent = '✓';
            renderCalibDots(-1, idx + 1);
            await delay(320);
          }
        }
        if (!ok) {
          calibrationFailed(
            `We couldn’t detect your eyes moving ${p.key}. ` +
            'Sit a bit closer to the camera in even lighting, and move your eyes (or head) clearly toward each dot.');
          return;
        }
      }
    } catch (err) {
      calibrationFailed(err.message);
      return;
    }

    // pair sanity: opposite directions must actually oppose each other
    const xOk = (points.left.x - points.center.x) * (points.right.x - points.center.x) < 0;
    const yOk = (points.up.y - points.center.y) * (points.down.y - points.center.y) < 0;
    if (!xOk || !yOk) {
      calibrationFailed(
        `Your ${!xOk ? 'left and right' : 'up and down'} looks came out too similar. ` +
        'Try again with clearer eye movements toward each dot.');
      return;
    }

    tracker.setCalibration(points);
    ui.calibStatus.textContent = 'Calibrated ✓';
    setTimeout(() => {
      hide(ui.calib);
      if (returnToPause) {
        returnToPause = false;
        startWarmup(true);
      } else {
        beginSession();
      }
    }, 450);
  }

  let returnToPause = false;

  function calibrationFailed(msg) {
    hide(ui.calib);
    if (returnToPause) {
      // mid-session recalibration failed — go back to the pause menu
      returnToPause = false;
      state = 'paused';
      ui.pauseTitle.textContent = 'Calibration didn’t take';
      ui.pauseMsg.textContent = msg;
      show(ui.pause);
      return;
    }
    show(ui.start);
    ui.startError.textContent = msg;
    show(ui.startError);
    tracker.stop();
    state = 'menu';
  }

  function startWarmup(midSession) {
    warmup.target = { x: W * 0.5, y: H * 0.42 };
    warmup.inT = 0;
    warmup.t = 0;
    warmup.mid = midSession;
    show(ui.hud);
    lastTime = performance.now();
    state = 'warmup';
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
    game.inChallenge = !!(challenge && !challengeDone);
    if (!game.inChallenge) hide(ui.challengeBanner);
    makeBackground();
    makeLevel(game.level, game.inChallenge ? challenge.constellation : null);
    hide(ui.start);
    hide(ui.over);
    hide(ui.pause);
    show(ui.hud);
    ui.trackDot.classList.toggle('ok', game.mode === 'touch' || tracker.faceVisible);
    updateHud();
    // eye/head players get a quick "glide into the ring" control check first
    if (game.mode === 'touch') showLevelCard();
    else startWarmup(false);
  }

  function isUnlocked() {
    try { return !!localStorage.getItem('stargaze.license'); } catch (e) { return false; }
  }

  function nextLevel() {
    // a challenge is a single constellation — straight to the verdict
    if (game.inChallenge) {
      challengeDone = true;
      endSession();
      return;
    }
    const next = game.level + 1;
    // paywall only once selling is configured; otherwise free early access
    if (CFG.PAYMENT_LINK && !isUnlocked() && next > (CFG.PREVIEW_LEVELS || 5)) {
      showUnlock();
      return;
    }
    game.level = next;
    makeLevel(game.level);
    updateHud();
    if ((game.level - 1) % 3 === 0 && game.level > 1) startBreathing();
    else showLevelCard();
  }

  function showUnlock() {
    state = 'unlock';
    ui.unlockPrice.textContent = CFG.PRICE || '$50';
    ui.buyBtn.href = CFG.PAYMENT_LINK || '#';
    hide(ui.unlockError);
    show(ui.unlock);
  }

  async function tryLicense() {
    const key = ui.licenseInput.value.trim();
    if (!key) return;
    ui.licenseBtn.disabled = true;
    ui.licenseBtn.textContent = 'Checking…';
    try {
      const body = new URLSearchParams({
        product_permalink: CFG.GUMROAD_PERMALINK || '',
        license_key: key,
      });
      const res = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body });
      const data = await res.json();
      if (data && data.success) {
        try { localStorage.setItem('stargaze.license', key); } catch (e) { /* private mode */ }
        hide(ui.unlock);
        game.level += 1;
        makeLevel(game.level);
        updateHud();
        showLevelCard();
      } else {
        ui.unlockError.textContent = 'That key didn’t verify. Check for typos, or contact us with your receipt.';
        show(ui.unlockError);
      }
    } catch (e) {
      ui.unlockError.textContent = 'Couldn’t reach the license server. Check your connection and try again.';
      show(ui.unlockError);
    }
    ui.licenseBtn.disabled = false;
    ui.licenseBtn.textContent = 'Unlock';
  }

  function showLevelCard() {
    hide(ui.factCard);
    ui.cardPre.textContent = `Level ${game.level}`;
    ui.cardTitle.textContent = game.constellation ? game.constellation.name : `Level ${game.level}`;
    ui.cardHint.textContent = MODE_HINTS[game.levelMode] || '';
    show(ui.card);
    cardT = 2.4;
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
    hide(ui.factCard);
    const score = Math.floor(game.score);
    if (score > best) {
      best = score;
      try { localStorage.setItem('stargaze.best', String(best)); } catch (e) { /* private mode */ }
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
    lastShare = { constellation: game.constellation, acc };

    if (game.inChallenge && challenge.targetP !== null) {
      const t = challenge.targetP;
      ui.focusReport.textContent =
        acc > t ? `You wove ${game.constellation.name} at ${acc}% — your friend scored ${t}%. You win! ✦` :
        acc === t ? `A perfect tie — ${acc}% each on ${game.constellation.name}. The stars are amused.` :
        `${acc}% vs your friend's ${t}% on ${game.constellation.name}. So close — weave it again.`;
    } else {
      ui.focusReport.textContent =
        acc >= 90 ? `${acc}% precision — calm, deliberate attention. Beautiful.` :
        acc >= 70 ? `${acc}% precision — steady progress. Focus grows with practice.` :
        `${acc}% precision — slow down and let the ring fill. That pause IS the training.`;
    }
    game.inChallenge = false;

    hide(ui.hud);
    show(ui.over);
  }

  async function shareChallenge() {
    if (!lastShare) return;
    const base = location.origin + location.pathname;
    const url = `${base}?c=${slugOf(lastShare.constellation.name)}&p=${lastShare.acc}`;
    const text = `I wove ${lastShare.constellation.name} with my eyes at ${lastShare.acc}% precision on Stargaze ✦ Think you can beat me?`;
    const btn = ui.challengeShareBtn;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Stargaze challenge', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      btn.textContent = 'Challenge copied ✓';
    } catch (e) {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        btn.textContent = 'Challenge copied ✓';
      } catch (e2) { btn.textContent = url; }
    }
    setTimeout(() => { btn.textContent = '✦ Challenge a friend'; }, 2500);
  }

  function quitToMenu() {
    state = 'menu';
    tracker.stop();
    hide(ui.pause);
    hide(ui.over);
    hide(ui.hud);
    hide(ui.card);
    hide(ui.breath);
    hide(ui.unlock);
    hide(ui.factCard);
    show(ui.start);
  }

  ui.startBtn.addEventListener('click', startFlow);
  ui.pauseBtn.addEventListener('click', () => pauseGame('Paused'));
  ui.resumeBtn.addEventListener('click', resumeGame);
  ui.quitBtn.addEventListener('click', endSession);
  ui.breathSkip.addEventListener('click', endBreathing);
  ui.recalBtn.addEventListener('click', () => {
    if (game.mode === 'touch') { resumeGame(); return; }
    returnToPause = true;
    hide(ui.pause);
    hide(ui.hud);
    show(ui.calib);
    runCalibration();
  });
  ui.licenseBtn.addEventListener('click', tryLicense);
  ui.unlockLaterBtn.addEventListener('click', () => { hide(ui.unlock); endSession(); });
  ui.challengeShareBtn.addEventListener('click', shareChallenge);

  // arriving via a challenge link: greet the challenge on the start screen
  if (challenge) {
    ui.challengeBanner.textContent = challenge.targetP !== null
      ? `✦ Challenge: weave ${challenge.constellation.name} in order — beat ${challenge.targetP}%`
      : `✦ Challenge: weave ${challenge.constellation.name} in order`;
    show(ui.challengeBanner);
  }
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
