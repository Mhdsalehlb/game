/**
 * Stargaze theme system — Night (default) and Light ("Dawn") modes.
 * Applies a body class, persists the choice, and exposes the canvas
 * palette the game renderer reads each frame.
 */
(function () {
  'use strict';

  // Muted, low-saturation tones: ink indigo, champagne gold, silver-blue.
  const PALETTES = {
    night: {
      bgTop: '#0b0d18',
      bgBot: '#141830',
      nebulaHues: [226, 258, 205],
      nebulaAlpha: 0.04,
      bgStar: '238, 234, 220',        // pale starlight (rgb triplet)
      starUnlit: '230, 228, 220',
      starError: '#c493a2',
      starLit: '#e7d6ae',             // champagne
      litGlow: '#d9c28f',
      link: 'rgba(217, 194, 143, 0.4)',
      linkGlow: '#d9c28f',
      hint: '170, 182, 211',          // silver-blue triplet
      cursorIn: '#f2f5fa',
      cursorOut: '#aab6d3',
      cursorGlow: '#aab6d3',
      decoy: '196, 147, 162',         // muted rose triplet
      decoyGlow: '#c493a2',
      particleStar: '#e7d6ae',
      particleLevel: '#aab6d3',
      text: 'rgba(233, 233, 240, 0.8)',
    },
    light: {
      bgTop: '#f5f4f0',
      bgBot: '#e8eaf0',
      nebulaHues: [215, 255, 170],
      nebulaAlpha: 0.06,
      bgStar: '110, 118, 150',
      starUnlit: '100, 108, 140',
      starError: '#ba7890',
      starLit: '#a3894c',
      litGlow: '#b89a55',
      link: 'rgba(163, 137, 76, 0.45)',
      linkGlow: '#b89a55',
      hint: '95, 115, 150',
      cursorIn: '#ffffff',
      cursorOut: '#5f7396',
      cursorGlow: '#8fa2c2',
      decoy: '186, 120, 144',
      decoyGlow: '#ba7890',
      particleStar: '#a3894c',
      particleLevel: '#8fa2c2',
      text: 'rgba(51, 56, 78, 0.82)',
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
