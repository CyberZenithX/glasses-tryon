// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm,
// so the app serves it from its own host (no CDN at runtime) and it always matches
// the pinned @mediapipe/tasks-vision version. Runs automatically before dev/build.
import { cpSync, mkdirSync } from 'node:fs';

const source = 'node_modules/@mediapipe/tasks-vision/wasm';
const target = 'public/mediapipe/wasm';
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

mkdirSync(target, { recursive: true });
for (const file of files) cpSync(`${source}/${file}`, `${target}/${file}`);
console.log(`Copied MediaPipe WASM runtime to ${target}`);
