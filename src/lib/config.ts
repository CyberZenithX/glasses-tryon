// Every tunable value in the app lives here, with a note on what changing it does.
// Other modules import from this file instead of hard-coding numbers, so tuning
// the try-on never means hunting through the code.

export const CONFIG = {
  webcam: {
    // Requested camera resolution. The browser picks the closest mode it supports.
    // Lower values (e.g. 640x480) are cheaper to upload to the GPU each frame; try
    // that first if FPS is below target. Face tracking itself downsamples internally,
    // so resolution mostly affects how sharp the video looks, not tracking quality.
    idealWidth: 1280,
    idealHeight: 720,
    // Requested frame rate. Tracking runs once per new camera frame, so this caps FPS.
    idealFrameRate: 30,
  },

  tracker: {
    // Files are served from this app's own host (copied into /public), never a CDN.
    wasmBasePath: '/mediapipe/wasm',
    modelPath: '/mediapipe/face_landmarker.task',
    // Confidence thresholds (0..1). Higher = fewer false faces but tracking drops
    // out sooner in poor light or at steep angles. Lower = the opposite.
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  camera: {
    // These three values MUST match the virtual camera MediaPipe assumes when it
    // computes the face transformation matrix (see mediapipe/tasks/cc/vision/
    // face_geometry/face_geometry_from_landmarks_graph.cc). If the Three.js camera
    // differs, the glasses drift off the face as you move. Not a tuning knob.
    verticalFovDeg: 63,
    nearCm: 1, // MediaPipe's metric space is in centimetres
    farCm: 10000,
  },

  glasses: {
    // Draco decoder for compressed .glb files, served locally (drei would use a CDN).
    dracoDecoderPath: '/draco/',
    // How far in front of the nose-bridge skin the front of the frame sits, in cm.
    // Bigger = glasses float further from the face.
    frontGapFromNoseBridgeCm: 0.6,
    // Real glasses tilt slightly, with the lower rims closer to the cheeks
    // ("pantoscopic tilt"), and this tilt is added to every model. Positive = lower rims move in.
    pantoscopicTiltDeg: 6,
    // Temple arm length from hinge to tip, in cm. Every model's arms are stretched or
    // shrunk to this so they reach just behind the ear. Real arms are ~13.5-15 cm.
    // Increase if arm tips stop in front of the ear; decrease if they reach too far back.
    templeLengthCm: 14,
    // Limits on that stretch, so an unusual model can't be distorted too much.
    templeStretchRange: [0.7, 1.5] as [number, number],
    // How much the arms slope down from the hinge towards the ear (degrees).
    // Increase if arms pass above the ears; decrease if they pass below.
    templeSlopeDownDeg: 7,
    // Fraction of a model's depth (front to temple tips) that counts as "the frame
    // front". Its width is the frame width and its centre goes on the eyes. Using
    // only the front means temple arms (which may splay wider or droop) are ignored.
    frontSliceFraction: 0.08,
    // How fast the glasses fade in/out when a face appears/disappears (seconds).
    fadeDurationSec: 0.25,
  },

  stats: {
    // How many recent frames the live FPS / latency figures average over.
    // Bigger = steadier numbers that react more slowly to changes.
    windowFrames: 90, // ~3 s at 30 fps
    // How often the on-screen stats panel refreshes (per second). Refreshing
    // less often keeps the panel readable and costs almost nothing.
    panelRefreshHz: 4,
  },

  debug: {
    landmarkRadiusPx: 1.6, // size of each landmark dot in the debug view
    landmarkColor: '#3ee6a8',
    poseAxesLengthCm: 8, // length of the red/green/blue head axes in the debug view
    faceWireframeColor: '#3ee6a8', // canonical face mesh drawn on the face in debug view
  },
} as const;
