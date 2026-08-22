/** Stargaze landing page — ambient sky, pricing wiring, share links. */
(function () {
  'use strict';

  const CFG = window.STARGAZE_CONFIG || {};

  // ------------------------------------------------------------ pricing
  const buyLink = document.getElementById('buyLink');
  const heroBuy = document.getElementById('heroBuy');
  const buyNote = document.getElementById('buyNote');
  const priceValue = document.getElementById('priceValue');
  priceValue.textContent = CFG.PRICE || '$50';

  if (CFG.PAYMENT_LINK) {
    buyLink.textContent = `Get lifetime access — ${CFG.PRICE || '$50'}`;
    buyLink.href = CFG.PAYMENT_LINK;
    buyLink.target = '_blank';
    buyLink.rel = 'noopener';
    heroBuy.textContent = `Get Stargaze — ${CFG.PRICE || '$50'}`;
    heroBuy.href = '#pricing';
    buyNote.textContent = `Includes a free ${CFG.PREVIEW_LEVELS || 5}-level preview — try before you buy.`;
  }

  // -------------------------------------------------------------- share
  const url = encodeURIComponent(location.origin + location.pathname);
  const text = encodeURIComponent('Stargaze — a calm game you play with your eyes. Weave constellations, restore your focus. ✦');
  document.getElementById('shareX').href = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
  document.getElementById('shareWa').href = `https://wa.me/?text=${text}%20${url}`;
  document.getElementById('shareTg').href = `https://t.me/share/url?url=${url}&text=${text}`;
  document.getElementById('shareCopy').addEventListener('click', async () => {
    const btn = document.getElementById('shareCopy');
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      btn.textContent = 'Copied ✓';
    } catch (e) {
      btn.textContent = location.origin + location.pathname;
    }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
  });

  // ------------------------------------------------- ambient constellation
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, stars = [], links = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.4,
        tw: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
      });
    }
    // a loose constellation among a handful of the brighter stars
    links = [];
    const bright = stars.slice(0, 7);
    for (let i = 1; i < bright.length; i++) links.push([bright[i - 1], bright[i]]);
  }

  function palette() {
    const light = document.body.classList.contains('light');
    return light
      ? { star: '110, 118, 150', link: 'rgba(163, 137, 76, 0.22)' }
      : { star: '238, 234, 220', link: 'rgba(217, 194, 143, 0.18)' };
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    const pal = palette();
    const now = performance.now();

    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.link;
    for (const [a, b] of links) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const s of stars) {
      s.x += s.vx * 0.016;
      s.y += s.vy * 0.016;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
      const a = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(s.tw + now / 1100));
      ctx.fillStyle = `rgba(${pal.star}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
