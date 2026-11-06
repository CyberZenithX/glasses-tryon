// Copies WASM decoders from node_modules into public/, so the app serves them
// from its own host (no CDN at runtime) and they always match the pinned package
// versions. Runs automatically before `npm run dev` and `npm run build`.
//   - MediaPipe Face Landmarker runtime -> public/mediapipe/wasm
//   - Draco mesh decoder (for compressed .glb glasses models) -> public/draco
import { cpSync, mkdirSync } from 'node:fs';

const copies = [
  {
    from: 'node_modules/@mediapipe/tasks-vision/wasm',
    to: 'public/mediapipe/wasm',
    files: ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'],
  },
  {
    from: 'node_modules/three/examples/jsm/libs/draco/gltf',
    to: 'public/draco',
    files: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  },
];

for (const { from, to, files } of copies) {
  mkdirSync(to, { recursive: true });
  for (const file of files) cpSync(`${from}/${file}`, `${to}/${file}`);
  console.log(`Copied ${files.length} files to ${to}`);
}
