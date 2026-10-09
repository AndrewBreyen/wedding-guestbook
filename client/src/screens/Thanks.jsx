import { useEffect, useRef, useState } from "react";

const AUTO_DISMISS_MS = 40_000;

export default function Thanks({ name, onDone }) {
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_DISMISS_MS / 1000);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const deadline = Date.now() + AUTO_DISMISS_MS;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        onDoneRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedSeconds = AUTO_DISMISS_MS / 1000 - secondsRemaining;

  return (
    <div className="thanks-overlay">
      <div className="thanks-card">
        <h2 className="thanks-title">Thanks, {name}!</h2>
        <p className="thanks-sub">Your photo is on its way!</p>
        <p className="thanks-note">
          Your print may take up to 45 seconds.
          <br />
          The printer is building suspense.
        </p>
        <div
          className="thanks-progress"
          role="progressbar"
          aria-label="Returning to the welcome screen"
          aria-valuemin="0"
          aria-valuemax="40"
          aria-valuenow={elapsedSeconds}
          aria-valuetext={`Returning automatically in ${secondsRemaining} seconds`}
        >
          <div className="thanks-progress-fill" />
        </div>
        <p className="thanks-countdown">
          Returning to the welcome screen in {secondsRemaining} seconds
        </p>
        <button className="btn btn-primary" onClick={onDone}>
          Return to Welcome
        </button>
      </div>
    </div>
  );
}
