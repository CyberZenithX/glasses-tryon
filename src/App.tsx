// Top-level layout and UI state. Starts the camera, then the face tracker, then
// shows the mirrored "stage" (webcam + 3D glasses) with overlays on top. The stage
// keeps the video's aspect ratio and is scaled to cover the screen, like a camera app.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import StatsOverlay from './components/StatsOverlay.tsx';
import StatusScreen, { type AppStatus } from './components/StatusScreen.tsx';
import TryOnCanvas from './components/TryOnCanvas.tsx';
import { CATALOG } from './lib/catalog.ts';
import { createFaceTracker, type FaceTracker } from './lib/faceTracker.ts';
import { PerformanceMonitor } from './lib/performance.ts';
import { startWebcam, stopWebcam, WebcamError } from './lib/webcam.ts';

interface Session {
  video: HTMLVideoElement;
  tracker: FaceTracker;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<AppStatus>({ kind: 'starting-camera' });
  // The playing video + loaded tracker. Stored in state (not a ref) so the 3D
  // canvas renders as soon as both are ready.
  const [session, setSession] = useState<Session | null>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [debugCanvas, setDebugCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // One monitor for the app's lifetime: the frame loop writes to it, the panel reads it.
  const [monitor] = useState(() => new PerformanceMonitor());
  const [faceVisible, setFaceVisible] = useState(false);
  // Bumping this re-runs the start-up effect ("Try again" button).
  const [attempt, setAttempt] = useState(0);

  // Start-up sequence: camera first (so the permission prompt appears right away),
  // then the face tracking model.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React may run this effect twice in development; `cancelled` makes sure
    // anything that finishes starting after cleanup is released immediately.
    let cancelled = false;
    let stream: MediaStream | null = null;
    let tracker: FaceTracker | null = null;

    const start = async () => {
      try {
        stream = await startWebcam(video);
      } catch (error) {
        if (cancelled) return; // e.g. play() interrupted by our own cleanup
        console.warn('Camera failed to start:', error);
        setStatus({ kind: 'error', reason: error instanceof WebcamError ? error.reason : 'unknown' });
        return;
      }
      if (cancelled) return;
      setVideoAspect(video.videoWidth / video.videoHeight);
      setStatus({ kind: 'loading-tracker' });

      try {
        tracker = await createFaceTracker();
      } catch (error) {
        if (cancelled) return;
        console.warn('Face tracker failed to load:', error);
        setStatus({ kind: 'error', reason: 'tracker-failed' });
        return;
      }
      if (cancelled) return tracker.close();
      setSession({ video, tracker });
      setStatus({ kind: 'ready' });
    };
    void start();

    return () => {
      cancelled = true;
      setSession(null);
      tracker?.close();
      stopWebcam(stream, video);
    };
  }, [attempt]);

  // Keyboard shortcuts for the debug view and stats (handy while recording / presenting).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'd') setShowDebug((on) => !on);
      if (event.key === 's') setShowStats((on) => !on);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const retry = () => {
    setStatus({ kind: 'starting-camera' });
    setAttempt((n) => n + 1);
  };

  // --video-aspect drives the CSS that sizes the stage to "cover" the screen.
  const stageStyle = { '--video-aspect': videoAspect ?? 16 / 9 } as CSSProperties;

  return (
    <main className="app">
      {/* The stage is mirrored as ONE unit (video + 3D + debug dots), so the selfie
          view feels natural and everything stays aligned with the face. */}
      <div className="stage" style={stageStyle}>
        <video ref={videoRef} className="stage-video" playsInline muted />
        {session && (
          <TryOnCanvas
            video={session.video}
            tracker={session.tracker}
            model={CATALOG[0] ?? null}
            monitor={monitor}
            showDebug={showDebug}
            debugCanvas={debugCanvas}
            onFaceVisibleChange={setFaceVisible}
          />
        )}
        <canvas
          ref={setDebugCanvas}
          className="debug-canvas"
          width={session?.video.videoWidth ?? 0}
          height={session?.video.videoHeight ?? 0}
          hidden={!showDebug}
        />
      </div>

      {status.kind === 'ready' && session && (
        <>
          {showStats && (
            <StatsOverlay
              monitor={monitor}
              delegate={session.tracker.delegate}
              videoWidth={session.video.videoWidth}
              videoHeight={session.video.videoHeight}
            />
          )}
          <div className="toolbar">
            <button
              type="button"
              className={`chip ${showStats ? 'chip-on' : ''}`}
              aria-pressed={showStats}
              onClick={() => setShowStats((on) => !on)}
            >
              Stats
            </button>
            <button
              type="button"
              className={`chip ${showDebug ? 'chip-on' : ''}`}
              aria-pressed={showDebug}
              onClick={() => setShowDebug((on) => !on)}
            >
              Debug
            </button>
          </div>
          {!faceVisible && <p className="face-hint">Look at the camera to try on glasses</p>}
        </>
      )}
      <StatusScreen status={status} onRetry={retry} />
    </main>
  );
}
