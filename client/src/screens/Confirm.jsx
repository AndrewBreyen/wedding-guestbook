import { useEffect, useRef, useState } from "react";
import PrintPreviewImage from "../PrintPreviewImage.jsx";
import { composePrintImage } from "../composePrintImage";

export default function Confirm({ draft, emailLocked, onEmailChange, onRetake, onConfirm }) {
  const emailInputRef = useRef(null);
  const [printPreview, setPrintPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let previewUrl;
    setPrintPreview(null);
    setPreviewError(null);

    Promise.all([
      composePrintImage({ photoBlob: draft.photoBlob, name: draft.name }),
      composePrintImage({ photoBlob: draft.photoBlob, name: draft.name, dpi: 600 }),
    ])
      .then(([printImageBlob, previewBlob]) => {
        if (cancelled) return;
        previewUrl = URL.createObjectURL(previewBlob);
        setPrintPreview({ blob: printImageBlob, url: previewUrl });
      })
      .catch((err) => {
        console.error("Unable to create the print preview:", err);
        if (!cancelled) setPreviewError("Could not prepare the print preview. Please retake your photo.");
      });

    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [draft.name, draft.photoBlob]);

  async function handleConfirm() {
    if (!printPreview) return;
    const email = (draft.email || "").trim();
    if (email && !emailInputRef.current?.checkValidity()) {
      emailInputRef.current.reportValidity();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(printPreview.blob, email);
    } catch (err) {
      setError(err.message || "Something went wrong saving your entry. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="screen confirm-screen">
      <p className="eyebrow">Look good?</p>
      <div
        className="confirm-print-preview"
        aria-label="Print preview"
      >
        {printPreview ? (
          <PrintPreviewImage src={printPreview.url} alt="Exactly what will be printed" large />
        ) : (
          <p>{previewError || "Preparing your print preview…"}</p>
        )}
      </div>
      <label className="confirm-email-label" htmlFor="guest-email">
        Email the photo to be sent to after the wedding (optional)
        <input
          ref={emailInputRef}
          id="guest-email"
          className="confirm-email-input"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={draft.email || ""}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="you@example.com"
          disabled={saving || emailLocked}
        />
        {emailLocked && <span className="confirm-email-hint">Email saved with this entry.</span>}
      </label>
      <div className="confirm-actions">
        <button className="btn btn-secondary" onClick={onRetake} disabled={saving}>
          Retake
        </button>
        <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !printPreview}>
          {saving ? "Saving..." : "Confirm & Print"}
        </button>
      </div>
      {previewError && <p className="form-error" role="alert">{previewError}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
