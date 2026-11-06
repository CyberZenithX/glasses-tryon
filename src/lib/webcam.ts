// Starts and stops the user's front camera and turns browser errors into a small
// set of friendly states the UI can show. This is the first step of the data flow:
// it fills the hidden <video> element that face tracking and the 3D scene read from.
import { CONFIG } from './config.ts';

export type WebcamErrorReason =
  | 'unsupported' // browser has no getUserMedia (very old browser or in-app webview)
  | 'insecure' // page not served over HTTPS or localhost, so the browser hides the camera
  | 'denied' // user (or browser policy / iframe without allow="camera") refused access
  | 'not-found' // no camera connected
  | 'in-use' // another app is holding the camera
  | 'unknown';

export class WebcamError extends Error {
  readonly reason: WebcamErrorReason;
  constructor(reason: WebcamErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Asks for the front camera, plays it in `video`, and resolves once frames are flowing.
 * `size` overrides the requested resolution (used by the ?camera= test switch).
 */
export async function startWebcam(
  video: HTMLVideoElement,
  size: { width: number; height: number } = { width: CONFIG.webcam.idealWidth, height: CONFIG.webcam.idealHeight },
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new WebcamError('insecure', 'The camera needs a secure (https) connection.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new WebcamError('unsupported', 'This browser cannot access the camera.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: size.width },
        height: { ideal: size.height },
        frameRate: { ideal: CONFIG.webcam.idealFrameRate },
      },
    });
  } catch (error) {
    throw toWebcamError(error);
  }

  // iOS Safari only plays inline, muted video without a user gesture.
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  // videoWidth/videoHeight are only known after metadata loads; the 3D canvas needs them.
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  return stream;
}

/** Releases the camera so the browser's "camera in use" light turns off. */
export function stopWebcam(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  stream?.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
}

// getUserMedia rejects with DOMExceptions whose `name` tells us what went wrong.
function toWebcamError(error: unknown): WebcamError {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new WebcamError('denied', 'Camera access was blocked.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new WebcamError('not-found', 'No camera was found.');
    case 'NotSupportedError':
      return new WebcamError('unsupported', 'This browser cannot access the camera.');
    case 'NotReadableError':
    case 'AbortError':
      return new WebcamError('in-use', 'The camera is being used by another app.');
    default:
      return new WebcamError('unknown', error instanceof Error ? error.message : String(error));
  }
}
