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

  camera: {
    // These three values MUST match the virtual camera MediaPipe assumes when it
    // computes the face transformation matrix (see mediapipe/tasks/cc/vision/
    // face_geometry/face_geometry_from_landmarks_graph.cc). If the Three.js camera
    // differs, the glasses drift off the face as you move. Not a tuning knob.
    verticalFovDeg: 63,
    nearCm: 1, // MediaPipe's metric space is in centimetres
    farCm: 10000,
  },
} as const;
