export default function Welcome({ onStart, onViewAll }) {
  return (
    <div className="screen">
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
