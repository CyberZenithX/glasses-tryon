// Performance test switches, read once from the address bar. They let us find what
// slows a real phone down without a new build each time. None is on by default.
//   ?tracker=cpu       run face tracking on the CPU instead of the GPU
//   ?camera=480        ask the camera for 640x480 instead of CONFIG.webcam's size
//   ?dpr=1             render the 3D view at 1 pixel per CSS pixel (fewer pixels to draw)
//   ?shadows=0         no shadow map (skips the extra shadow render pass)
//   ?transmission=0    see-through lenses without transmission (skips the extra scene render)
//   ?lite=1            dpr=1 + shadows=0 + transmission=0 together
const params = new URLSearchParams(window.location.search);
const lite = params.get('lite') === '1';

export const TEST_SWITCHES = {
  forceCpuTracker: params.get('tracker') === 'cpu',
  lowResCamera: params.get('camera') === '480',
  singlePixelRatio: lite || params.get('dpr') === '1',
  noShadows: lite || params.get('shadows') === '0',
  noTransmission: lite || params.get('transmission') === '0',
};
