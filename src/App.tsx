// Top-level layout and UI state. Starts the camera, then shows the mirrored
// "stage" (webcam + 3D glasses) with overlays on top. The stage keeps the video's
// aspect ratio and is scaled to cover the screen, like a camera app.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import StatusScreen, { type AppStatus } from './components/StatusScreen.tsx';
import TryOnCanvas from './components/TryOnCanvas.tsx';
import { startWebcam, stopWebcam, WebcamError } from './lib/webcam.ts';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<AppStatus>({ kind: 'starting-camera' });
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  // The <video> element, stored in state once it is playing, so the 3D canvas
  // re-renders when it becomes available (refs alone do not trigger renders).
  const [liveVideo, setLiveVideo] = useState<HTMLVideoElement | null>(null);
  // Bumping this re-runs the start-up effect ("Try again" button).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React may run this effect twice in development; `cancelled` makes sure a
    // camera that finishes starting after cleanup is released immediately.
    let cancelled = false;
    let stream: MediaStream | null = null;

    startWebcam(video)
      .then((startedStream) => {
        stream = startedStream;
        if (cancelled) return stopWebcam(stream);
        setVideoAspect(video.videoWidth / video.videoHeight);
        setLiveVideo(video);
        setStatus({ kind: 'ready' });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn('Camera failed to start:', error);
        setStatus({ kind: 'error', reason: error instanceof WebcamError ? error.reason : 'unknown' });
      });

    return () => {
      cancelled = true;
      setLiveVideo(null);
      stopWebcam(stream, video);
    };
  }, [attempt]);

  const retry = () => {
    setStatus({ kind: 'starting-camera' });
    setAttempt((n) => n + 1);
  };

  // --video-aspect drives the CSS that sizes the stage to "cover" the screen.
  const stageStyle = { '--video-aspect': videoAspect ?? 16 / 9 } as CSSProperties;

  return (
    <main className="app">
      {/* The stage is mirrored as ONE unit (video + 3D canvas), so the selfie view
          feels natural and the glasses stay aligned with the face. */}
      <div className="stage" style={stageStyle}>
        <video ref={videoRef} className="stage-video" playsInline muted />
        {status.kind === 'ready' && liveVideo && <TryOnCanvas video={liveVideo} />}
      </div>
      <StatusScreen status={status} onRetry={retry} />
    </main>
  );
}
