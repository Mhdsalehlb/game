# ✦ Stargaze

**Focus training you play with your eyes.** A calm web game: star patterns appear in a night sky, and you light each star by resting your gaze on it until its ring fills. Lit stars weave glowing constellation lines. No lives, no game over — mistakes soften your streak, every third level ends in a guided breathing interlude, and sessions close with a focus report.

**Live site:** landing page at `/` (`index.html`), game at `/app.html`.

## Level progression

| Levels | Mode | What it trains |
|---|---|---|
| 1–2 | **Free** — light stars in any order | sustained, deliberate gaze (the dwell) |
| 3–4 | **Path** — follow the glowing hint | guided attention shifting |
| 5–6 | **Ordered** — numbered stars, in order | visual search + working memory |
| 7+ | **Memory** — pattern flashes once, then recall | memory under no guidance |
| 9+ | **+ Embers** — drifting distractors | distraction resistance |

Star count grows 3 → 8; streaks multiply score; night and light (dawn) themes.

## Eye tracking

iPhones don't expose Face ID / TrueDepth to web pages, so Stargaze uses the front camera + [MediaPipe Face Mesh](https://developers.google.com/mediapipe) (478 landmarks incl. irises) **entirely on-device** — nothing is recorded or uploaded.

- **Verified 5-point calibration**: the dot glides center → left → right → up → down. Each step is checked against the center sample (the signal must move enough, mostly on the right axis) and is retried with guidance if the user didn't follow; opposite directions must genuinely oppose or calibration restarts. A bad calibration can no longer silently continue.
- **Warm-up gate**: after calibrating, players glide the orb into a ring before the first level — proof the control works, with "Recalibrate" always available from the pause menu.
- Blink handling (gaze frozen during blinks), vertical gaze normalized by eye width, One Euro filtering, positional control.
- Control modes: Head + Eyes (default), Head only, Eyes only, Touch/Keyboard fallback.

## Selling it (the $50 lifetime model)

The paywall ships dormant. To turn it on (~10 minutes):

1. Create a [Gumroad](https://gumroad.com) product priced at $50. In its settings enable **"Generate a unique license key per sale."**
2. Open `js/config.js` and fill in:
   ```js
   PAYMENT_LINK: 'https://YOURNAME.gumroad.com/l/stargaze',
   GUMROAD_PERMALINK: 'stargaze',   // the part after /l/
   ```
3. Commit and deploy.

What changes once configured: the landing page's buttons become "Get Stargaze — $50" pointing at your checkout; the game shows an unlock screen after level `PREVIEW_LEVELS` (default 5) where buyers paste their Gumroad license key, which is verified against Gumroad's license API and remembered on that device. While `PAYMENT_LINK` is empty, everything honestly presents as free early access.

Notes: client-side license checks are convenience-grade, not DRM — fine for a $50 indie game. Stripe Payment Links work too for checkout, but Stripe has no license-key API, so keep Gumroad (or Lemon Squeezy) for the unlock step. Marketing claims: the landing copy deliberately avoids medical claims and includes a disclaimer — keep it that way.

## App experience & challenges

- **PWA**: `manifest.webmanifest` + `sw.js` make Stargaze installable (Add to Home Screen on iOS, Install on Android/desktop) with an offline shell — the app opens with no network, and MediaPipe files are cached after the first online play. Bump `CACHE_VERSION` in `sw.js` when cached assets change shape.
- **Challenge links**: the session summary's "✦ Challenge a friend" shares `app.html?c=<constellation>&p=<precision>` via the native share sheet (clipboard fallback). Opening one shows a challenge banner and plays that constellation in ordered mode; the summary compares precision against the challenger, and the next session returns to normal progression.

## Running locally

```bash
python3 -m http.server 8000    # or: npx serve .
```

Open `http://localhost:8000`. Camera works on `localhost` without HTTPS; on devices you need HTTPS (GitHub Pages provides it — `.github/workflows/pages.yml` deploys on every push to `main`).

## Project structure

```
index.html         Marketing landing page (hero, features, pricing, share, FAQ)
app.html           The game (menu, calibration, HUD, breathing, unlock, summary)
css/landing.css    Landing styles (night + light themes)
css/style.css      Game styles (night + light themes)
js/config.js       Seller config: payment link, license product, price, preview length
js/theme.js        Theme system + canvas palettes
js/tracking.js     FaceControl: camera + Face Mesh → smoothed [-1,1]² control
js/game.js         Game engine: levels, dwell, scoring, screens, paywall gate
js/landing.js      Landing ambience + pricing/share wiring
assets/og.png      Social-share image
```
