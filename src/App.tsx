// Top-level layout and UI state. Starts the camera, then the face tracker, then
// shows the mirrored "stage" (webcam + 3D glasses) with overlays on top. The stage
// keeps the video's aspect ratio and is scaled to cover the screen, like a camera app.
import { useGLTF } from '@react-three/drei';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import GlassesPicker from './components/GlassesPicker.tsx';
import StatsOverlay from './components/StatsOverlay.tsx';
import StatusScreen, { type AppStatus } from './components/StatusScreen.tsx';
import TryOnCanvas from './components/TryOnCanvas.tsx';
import { CATALOG } from './lib/catalog.ts';
import { CONFIG } from './lib/config.ts';
import { createFaceTracker, type FaceTracker } from './lib/faceTracker.ts';
import { PerformanceMonitor } from './lib/performance.ts';
import { TEST_SWITCHES } from './lib/testSwitches.ts';
import { startWebcam, stopWebcam, WebcamError } from './lib/webcam.ts';

// The ?camera=480 performance test switch (see testSwitches.ts).
const CAMERA_SIZE = TEST_SWITCHES.lowResCamera
  ? { width: CONFIG.webcam.lowWidth, height: CONFIG.webcam.lowHeight }
  : { width: CONFIG.webcam.idealWidth, height: CONFIG.webcam.idealHeight };

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
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState(CATALOG[0]?.id ?? '');
  const selectedModel = CATALOG.find((model) => model.id === selectedId) ?? null;
  // One monitor for the app's lifetime: the frame loop writes to it, the panel reads it.
  const [monitor] = useState(() => new PerformanceMonitor());
  const [faceVisible, setFaceVisible] = useState(false);
  // The "look at the camera" hint waits a moment before appearing: at steep
  // angles tracking can drop for a frame or two, and a flashing hint looks broken.
  const [showFaceHint, setShowFaceHint] = useState(false);
  // Bumping this re-runs the start-up effect ("Try again" button).
  const [attempt, setAttempt] = useState(0);

  // Download all glasses models in the background while the camera starts, so the
  // first switch to any frame is instant.
  useEffect(() => {
    CATALOG.forEach((model) => useGLTF.preload(model.file, CONFIG.glasses.dracoDecoderPath));
  }, []);

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
    const onVideoResize = () => {
      if (video.videoWidth > 0) setVideoAspect(video.videoWidth / video.videoHeight);
    };

    const start = async () => {
      try {
        stream = await startWebcam(video, CAMERA_SIZE);
      } catch (error) {
        if (cancelled) return; // e.g. play() interrupted by our own cleanup
        console.warn('Camera failed to start:', error);
        setStatus({ kind: 'error', reason: error instanceof WebcamError ? error.reason : 'unknown' });
        return;
      }
      if (cancelled) return;
      setVideoAspect(video.videoWidth / video.videoHeight);
      // Phones swap the camera's width/height when rotated: follow it, so the
      // stage (and the 3D camera's aspect ratio) always match the video.
      video.addEventListener('resize', onVideoResize);
      setStatus({ kind: 'loading-tracker' });

      try {
        tracker = await createFaceTracker(TEST_SWITCHES.forceCpuTracker);
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
      video.removeEventListener('resize', onVideoResize);
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

  useEffect(() => {
    if (faceVisible) return;
    const timer = window.setTimeout(() => setShowFaceHint(true), CONFIG.ui.faceHintDelayMs);
    return () => {
      window.clearTimeout(timer);
      setShowFaceHint(false); // face is back: hide the hint (and restart the delay next time)
    };
  }, [faceVisible]);

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
            model={selectedModel}
            monitor={monitor}
            smoothingEnabled={smoothingEnabled}
            showDebug={showDebug}
            debugCanvas={debugCanvas}
            onFaceVisibleChange={setFaceVisible}
          />
        )}
        <canvas
          ref={setDebugCanvas}
          className="debug-canvas"
          // Re-read on every render: videoAspect changes when the phone rotates.
          width={videoAspect && session ? session.video.videoWidth : 0}
          height={videoAspect && session ? session.video.videoHeight : 0}
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
              smoothingEnabled={smoothingEnabled}
              onSmoothingChange={setSmoothingEnabled}
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
          {showFaceHint && <p className="face-hint">Look at the camera to try on glasses</p>}
          <div className="bottom-bar">
            {selectedModel && (
              // CC-BY models must credit their authors; doing it where the model is shown.
              <p className="credit">
                {selectedModel.name} ·{' '}
                <a href={selectedModel.credit.sourceUrl} target="_blank" rel="noreferrer">
                  “{selectedModel.credit.title}” by {selectedModel.credit.author}
                </a>{' '}
                · {selectedModel.credit.license.replace('-4.0', ' 4.0').replace('-', ' ')}
              </p>
            )}
            <GlassesPicker models={CATALOG} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </>
      )}
      <StatusScreen status={status} onRetry={retry} />
    </main>
  );
}
