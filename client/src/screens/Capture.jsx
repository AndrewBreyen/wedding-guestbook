import { useEffect, useRef, useState } from "react";
import { getPrintPhotoAspectRatio } from "../composePrintImage";

export default function Capture({ draft, onTakePhoto, onCancel, onDemoPrint, onCalibrationPrint }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const photoInputRef = useRef(null);
  const streamRef = useRef(null);
  const [name, setName] = useState(draft.name || "");
  const [notes, setNotes] = useState(draft.notes || "");
  const [cameraError, setCameraError] = useState(null);
  const [demoPrintError, setDemoPrintError] = useState(null);
  const [photoLayoutError, setPhotoLayoutError] = useState(null);
  const [printingDemo, setPrintingDemo] = useState(false);
  const [ready, setReady] = useState(false);
  const [photoAspectRatio, setPhotoAspectRatio] = useState(1);
  const [layoutName, setLayoutName] = useState(null);
  const effectiveName = name.trim() || "Guest";

  useEffect(() => {
    let cancelled = false;
    setLayoutName(null);
    setPhotoLayoutError(null);
    getPrintPhotoAspectRatio(effectiveName)
      .then((ratio) => {
        if (!cancelled) {
          setPhotoAspectRatio(ratio);
          setLayoutName(effectiveName);
        }
      })
      .catch((err) => {
        console.error("Unable to calculate the print preview crop:", err);
        if (!cancelled) setPhotoLayoutError("Could not prepare the print preview. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveName]);

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

    const videoRatio = video.videoWidth / video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    if (videoRatio > photoAspectRatio) {
      sourceWidth = video.videoHeight * photoAspectRatio;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = video.videoWidth / photoAspectRatio;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    canvas.width = Math.round(sourceWidth);
    canvas.height = Math.round(sourceHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (photoBlob) => {
        if (photoBlob) {
          onTakePhoto({
            name: name.trim(),
            notes: notes.trim(),
            photoBlob,
            photoAspectRatio,
          });
        }
      },
      "image/jpeg",
      0.92
    );
  }

  function handlePhotoSelected(event) {
    const photoBlob = event.target.files?.[0];
    if (photoBlob) onTakePhoto({ name: name.trim(), notes: notes.trim(), photoBlob, photoAspectRatio });
    event.target.value = "";
  }

  async function printTest(onPrint) {
    setPrintingDemo(true);
    setDemoPrintError(null);
    try {
      await onPrint();
    } catch (err) {
      setDemoPrintError(err.message || "Could not print the demo card.");
    } finally {
      setPrintingDemo(false);
    }
  }

  const canCapture = ready
    && name.trim().length > 0
    && layoutName === effectiveName
    && !photoLayoutError
    && !cameraError;

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

      <div className="camera-frame" style={{ aspectRatio: photoAspectRatio }}>
        {cameraError ? (
          <div>
            <p className="camera-error">{cameraError}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      <button
        className="shutter-btn"
        onClick={capturePhoto}
        disabled={!canCapture}
        aria-label="Take photo"
      />
      {cameraError && <span className="sr-only">Use “Take or choose a photo” to continue.</span>}
      {!name.trim() && (
        <p className="form-error">Enter your name to take a photo</p>
      )}
      {photoLayoutError && <p className="form-error" role="alert">{photoLayoutError}</p>}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoSelected}
        hidden
      />
      <div className="capture-footer">
        <button
          className="btn-text"
          onClick={() => photoInputRef.current?.click()}
          disabled={!name.trim() || layoutName !== effectiveName || Boolean(photoLayoutError)}
        >
          Choose photo
        </button>
        <button className="btn-text" onClick={() => printTest(() => onDemoPrint(name.trim()))} disabled={printingDemo}>
          {printingDemo ? "Preparing print..." : "Demo print"}
        </button>
        <button className="btn-text" onClick={() => printTest(onCalibrationPrint)} disabled={printingDemo}>
          Calibration print
        </button>
        <button className="btn-text" onClick={onCancel}>
          Back to home
        </button>
      </div>
      {demoPrintError && <p className="form-error" role="alert">{demoPrintError}</p>}
    </div>
  );
}
