# 👁️ FocusBall

A web game that you steer **with your eyes and head**. Guide the glowing ball up, down, left, and right through moving obstacles — lose all three lives and the session is over. Designed as a light focus-training exercise: the longer you fly without a hit, the higher your **FOCUS multiplier** climbs, and at the end you get a report of your longest focus streak.

## How it works

iPhones don't expose the Face ID / TrueDepth sensor to web pages, so the game uses the next best thing: the **front camera + [MediaPipe Face Mesh](https://developers.google.com/mediapipe)** running entirely in your browser. It tracks 478 face landmarks (including your irises) every frame and converts your head turn and gaze direction into ball movement.

- **All processing happens on-device.** No video is recorded or uploaded anywhere.
- A short calibration captures your neutral pose; the ball then follows your offset from it.
- If your face leaves the frame, the game auto-pauses.

## Playing

1. Open the game over **HTTPS** (the camera API requires it — see hosting below).
2. Pick a control mode:
   - **Head + Eyes** (default, most reliable) — blend of head turn and gaze
   - **Head only** — steer by turning/tilting your head
   - **Eyes only** — steer by looking around (needs good lighting)
   - **Touch / Keyboard** — fallback: drag on screen or use WASD/arrow keys
3. Allow camera access, look at the dot until the calibration ring closes, and play.
4. Dodge the walls, blocks, and drifters; collect teal orbs for bonus points.

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
