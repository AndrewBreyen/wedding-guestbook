export default function Welcome({ onStart, onViewAll }) {
  const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

  return (
    <div className="screen">
      {demoMode && <p className="demo-notice">Demo mode — no data is saved. Entries reset when you refresh.</p>}
      <p className="eyebrow">Welcome to</p>
      <h1 className="welcome-names">Matt &amp; Hailey's Wedding</h1>
      <hr className="rule" />
      <p className="welcome-sub">Sign our guestbook and leave us a photo &amp; a note</p>
      <button className="btn btn-primary" onClick={onStart}>
        Sign In With a Photo
      </button>
      <button className="btn-text view-all-link" onClick={onViewAll}>
        View all guests
      </button>
    </div>
  );
}
