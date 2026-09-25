import { useEffect } from "react";

const AUTO_DISMISS_MS = 5000;

export default function Thanks({ name, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="thanks-overlay">
      <div className="thanks-card">
        <h2 className="thanks-title">Thanks, {name}!</h2>
        <p className="thanks-sub">Enjoy the wedding 🥂</p>
        <button className="btn btn-primary" onClick={onDone}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
