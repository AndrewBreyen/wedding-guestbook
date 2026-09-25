import { useEffect, useRef, useState } from "react";

export default function Capture({ draft, onTakePhoto, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [name, setName] = useState(draft.name || "");
  const [notes, setNotes] = useState(draft.notes || "");
  const [cameraError, setCameraError] = useState(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(null);
  const countTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      } catch (err) {
        setCameraError("Couldn't access the camera. Check camera permissions and try again.");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) onTakePhoto({ name: name.trim(), notes: notes.trim(), photoBlob: blob });
      },
      "image/jpeg",
      0.92
    );
  }

  function startCountdown() {
    setCount(3);
    countTimerRef.current = setInterval(() => {
      setCount((prev) => {
        if (prev <= 1) {
          clearInterval(countTimerRef.current);
          // Fire after this render so the "Smile!" frame has a beat to show.
          setTimeout(capturePhoto, 200);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => clearInterval(countTimerRef.current);
  }, []);

  const canCapture = ready && name.trim().length > 0 && !cameraError && count === null;

  return (
    <div className="screen capture-screen">
      <input
        className="name-input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus
      />
      <textarea
        className="notes-input"
        placeholder="Leave a note for the couple (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={280}
      />

      <div className="camera-frame">
        {cameraError ? (
          <p className="camera-error">{cameraError}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {count !== null && (
          <div className="countdown-overlay">{count > 0 ? count : "Smile!"}</div>
        )}
      </div>

      <button
        className="shutter-btn"
        onClick={startCountdown}
        disabled={!canCapture}
        aria-label="Take photo"
      />
      {!name.trim() && count === null && (
        <p className="form-error">Enter your name to take a photo</p>
      )}

      <button className="btn-text" onClick={onCancel}>
        Back to home
      </button>
    </div>
  );
}
