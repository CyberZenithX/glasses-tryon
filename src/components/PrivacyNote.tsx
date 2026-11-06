// Small, unobtrusive note that the try-on is private. The claim is literally true
// of the code: frames are processed in this browser tab, nothing is stored or
// sent, and the model files come from this app's own host (see README, Privacy).

export default function PrivacyNote() {
  return (
    <p className="privacy-note">
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span>Runs on your device. Your video is never uploaded or stored.</span>
    </p>
  );
}
