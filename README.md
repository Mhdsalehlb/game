# 👁️ FocusBall — Constellation Weaver

A calm web game you play **with your eyes and head**. Star patterns appear in a night sky; rest your gaze on a star and hold it there until its ring fills — the star lights, and glowing lines weave the constellation together. There are no lives and no game over: mistakes just soften your streak, and every third level ends with a guided breathing interlude.

It's built as a focus-training exercise. Each level type trains a different attention skill:

| Levels | Mode | What it trains |
|---|---|---|
| 1–2 | **Free** — light stars in any order | sustained, deliberate gaze (the dwell) |
| 3–4 | **Path** — follow the glowing hint | guided attention shifting |
| 5–6 | **Ordered** — find the numbers, light in order | visual search + working memory |
| 7+ | **Memory** — the pattern flashes once, then you recall it | attention + memory under no guidance |
| 9+ | **+ Embers** — drifting amber distractors cross the sky | distraction resistance (gazing at one breaks your streak) |

Star count grows from 3 to 8 as you level, holding your streak multiplies your score, and the session summary reports levels woven, stars lit, longest streak, focused minutes, and gaze precision.

## How it works

iPhones don't expose the Face ID / TrueDepth sensor to web pages, so the game uses the next best thing: the **front camera + [MediaPipe Face Mesh](https://developers.google.com/mediapipe)** running entirely in your browser. It tracks 478 face landmarks (including your irises) every frame and converts your head turn and gaze direction into ball movement.

- **All processing happens on-device.** No video is recorded or uploaded anywhere.
- A 5-point calibration (follow the dot to center/left/right/up/down) learns your personal range of motion per direction, so the mapping fits you rather than an assumed average.
- Control is **positional**: your gaze/head offset maps to a spot on screen and the ball glides there — look left, ball is left.
- Blinks are detected from eyelid openness and gaze is held through them (iris landmarks go haywire mid-blink).
- A One Euro filter smooths jitter adaptively: steady when you're still, low-latency when you move.
- If your face leaves the frame, the game auto-pauses; resuming gives a 3-2-1 countdown.

## Playing

1. Open the game over **HTTPS** (the camera API requires it — see hosting below).
2. Pick a control mode:
   - **Head + Eyes** (default, most reliable) — blend of head turn and gaze
   - **Head only** — steer by turning/tilting your head
   - **Eyes only** — steer by looking around (needs good lighting)
   - **Touch / Keyboard** — fallback: drag on screen or use WASD/arrow keys
3. Allow camera access and follow the calibration dot to all five positions.
4. Rest your gaze on each star until its ring fills. Weave the whole constellation to advance; end the session any time from the pause menu to see your focus summary.

**Tips:** sit in even lighting, keep the phone roughly at eye level, and use the sensitivity slider if the ball feels too sluggish or too twitchy.

## Running locally

Any static file server works. Camera access is allowed on `localhost` without HTTPS:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

To test on an iPhone you need HTTPS. Easiest options:

- **GitHub Pages** — Settings → Pages → deploy from branch. Free HTTPS, zero config.
- `npx serve . --ssl-cert ... --ssl-key ...`, Cloudflare Tunnel, ngrok, etc.

## Browser support

- iOS Safari 14.5+ (front camera, requires HTTPS)
- Chrome / Edge / Firefox on desktop and Android
- Works offline-hostile? No — MediaPipe models load from the jsDelivr CDN on first start.

## Project structure

```
index.html        Screens (menu, calibration, pause, game over) + HUD
css/style.css     Styling
js/tracking.js    FaceControl: camera + Face Mesh → smoothed [-1,1]² control vector
js/game.js        Game engine: ball physics, obstacles, scoring, screen flow
```
