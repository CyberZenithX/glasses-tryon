# Glasses Try-On: real-time virtual eyewear in the browser

> _GIF goes here._

Try on 3D glasses live through your webcam. Face tracking, 3D rendering and
smoothing all run inside the browser, so your video never leaves your device.

- **Live demo:** _TBD (Vercel)_
- **Demo video:** _TBD_

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev      # open the printed https/localhost URL and allow the camera
npm run check    # type-check, lint, unit tests and production build
```

The camera only works on `localhost` or over HTTPS.

## Approach

_TBD: Option A, built from scratch with open-source tools._

## Architecture

_TBD: overview and data-flow diagram. Full detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)._

## Models, frameworks and APIs

_TBD: table with versions._

## 3D model and asset credits

_TBD._

## Results

_TBD: real measured numbers only. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md)._

## Privacy

- **Frames are processed locally.** Face tracking and 3D rendering run in your
  browser. Camera frames never leave your device.
- **Nothing is stored or sent.** There is no backend, no upload and no recording.
  Capture & Compare photos stay in memory until you save them yourself.
- **No cookies, analytics or tracking.**
- **Model files are served from the app's own host** (`/public`), not from a
  third-party CDN: the MediaPipe WASM and face model, the 3D glasses, the Draco
  decoder and the HDR environment.

## Known limitations

_TBD._

## If this went to production

_TBD._

## AI tools used

This project was planned with Claude (Anthropic) and built with Claude Code as a
coding assistant. The prompts are logged in [AI_PROMPTS.md](AI_PROMPTS.md).

## Further reading

- [docs/PRODUCT_MEMO.md](docs/PRODUCT_MEMO.md)
- [docs/EMBED.md](docs/EMBED.md)
