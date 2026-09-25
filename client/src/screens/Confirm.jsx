import { useEffect, useState } from "react";

export default function Confirm({ draft, onRetake, onConfirm }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(draft.photoBlob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.photoBlob]);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || "Something went wrong saving your entry. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <p className="eyebrow">Look good?</p>
      <div className="confirm-photo">{photoUrl && <img src={photoUrl} alt="Your captured photo" />}</div>
      <h2 className="confirm-name">{draft.name}</h2>
      {draft.notes && <p className="confirm-notes">{draft.notes}</p>}

      <div className="confirm-actions">
        <button className="btn btn-secondary" onClick={onRetake} disabled={saving}>
          Retake
        </button>
        <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
          {saving ? "Saving..." : "Confirm & Print"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
