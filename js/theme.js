/**
 * Stargaze theme system — Night (default) and Light ("Dawn") modes.
 * Applies a body class, persists the choice, and exposes the canvas
 * palette the game renderer reads each frame.
 */
(function () {
  'use strict';

  const PALETTES = {
    night: {
      bgTop: '#0a0e1f',
      bgBot: '#131a35',
      nebulaHues: [228, 262, 200],
      nebulaAlpha: 0.05,
      bgStar: '255, 244, 214',        // warm starlight (rgb triplet)
      starUnlit: '244, 240, 228',
      starError: '#e8a0b4',
      starLit: '#f2dc9f',
      litGlow: '#e8c96a',
      link: 'rgba(238, 216, 150, 0.5)',
      linkGlow: '#e8c96a',
      hint: '162, 196, 232',          // moonlight blue triplet
      cursorIn: '#eef6ff',
      cursorOut: '#9fc0e8',
      cursorGlow: '#9fc0e8',
      decoy: '232, 160, 180',         // dusk rose triplet
      decoyGlow: '#e8a0b4',
      particleStar: '#f2dc9f',
      particleLevel: '#a2c4e8',
      text: 'rgba(238, 240, 250, 0.85)',
    },
    light: {
      bgTop: '#f6f3ec',
      bgBot: '#e7ebf4',
      nebulaHues: [210, 260, 160],
      nebulaAlpha: 0.07,
      bgStar: '106, 116, 168',
      starUnlit: '96, 106, 152',
      starError: '#c76a85',
      starLit: '#b8923a',
      litGlow: '#c9a24b',
      link: 'rgba(176, 141, 62, 0.55)',
      linkGlow: '#c9a24b',
      hint: '74, 111, 165',
      cursorIn: '#ffffff',
      cursorOut: '#4a6fa5',
      cursorGlow: '#7d9cc9',
      decoy: '199, 106, 133',
      decoyGlow: '#c76a85',
      particleStar: '#c9a24b',
      particleLevel: '#7d9cc9',
      text: 'rgba(44, 49, 73, 0.85)',
    },
  };

  let current = 'night';
  try { current = localStorage.getItem('stargaze.theme') || 'night'; } catch (e) { /* private mode */ }
  if (!PALETTES[current]) current = 'night';

  function apply(theme) {
    current = theme;
    document.body.classList.toggle('light', theme === 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', PALETTES[theme].bgTop);
    const btns = document.querySelectorAll('.theme-btn');
    btns.forEach((b) => { b.textContent = theme === 'light' ? '☾' : '☀'; });
    try { localStorage.setItem('stargaze.theme', theme); } catch (e) { /* private mode */ }
  }

  window.StargazeTheme = {
    get palette() { return PALETTES[current]; },
    get name() { return current; },
    toggle() { apply(current === 'light' ? 'night' : 'light'); },
    init() {
      apply(current);
      document.querySelectorAll('.theme-btn').forEach((b) => {
        b.addEventListener('click', () => window.StargazeTheme.toggle());
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.StargazeTheme.init());
  } else {
    window.StargazeTheme.init();
  }
})();
