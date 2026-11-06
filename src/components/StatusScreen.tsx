// Full-screen message shown while the camera or model is loading, or when
// something went wrong. Each error explains what happened and what to do next,
// so users never need instructions.
import type { WebcamErrorReason } from '../lib/webcam.ts';

export type AppStatus =
  | { kind: 'starting-camera' }
  | { kind: 'loading-tracker' }
  | { kind: 'ready' }
  | { kind: 'error'; reason: WebcamErrorReason | 'tracker-failed' };

const ERROR_TEXT: Record<Extract<AppStatus, { kind: 'error' }>['reason'], { title: string; body: string }> = {
  denied: {
    title: 'Camera access is blocked',
    body: 'Allow camera access in your browser’s address bar or site settings, then try again.',
  },
  'not-found': {
    title: 'No camera found',
    body: 'Connect a camera, or open this page on a phone or laptop with a front camera.',
  },
  'in-use': {
    title: 'Camera is busy',
    body: 'Another app (like a video call) is using your camera. Close it, then try again.',
  },
  insecure: {
    title: 'Secure connection needed',
    body: 'Browsers only allow the camera on https pages. Open the https version of this page.',
  },
  unsupported: {
    title: 'Browser not supported',
    body: 'Please open this page in a recent Chrome, Edge or Safari.',
  },
  'tracker-failed': {
    title: 'Face tracking could not start',
    body: 'Your browser could not load the face tracking model. Try reloading, or use a recent Chrome, Edge or Safari.',
  },
  unknown: {
    title: 'Something went wrong',
    body: 'The camera could not start. Try again, or reload the page.',
  },
};

export default function StatusScreen({ status, onRetry }: { status: AppStatus; onRetry: () => void }) {
  if (status.kind === 'ready') return null;

  if (status.kind === 'error') {
    const text = ERROR_TEXT[status.reason];
    return (
      <div className="status-screen" role="alert">
        <h1>{text.title}</h1>
        <p>{text.body}</p>
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  const message = status.kind === 'starting-camera' ? 'Allow camera access to try on glasses' : 'Loading face tracking…';
  return (
    <div className="status-screen" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
