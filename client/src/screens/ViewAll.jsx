import { useEffect, useState } from "react";
import { fetchEntries } from "../api";

export default function ViewAll({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchEntries()
      .then(setEntries)
      .catch(() => setError("Couldn't load guest entries."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="screen viewall-screen">
      <div className="viewall-header">
        <h2 className="viewall-title">All Guests ({entries.length})</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {loading && <p className="viewall-empty">Loading...</p>}
      {error && <p className="viewall-empty">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="viewall-empty">No guests have signed in yet.</p>
      )}

      <div className="viewall-grid">
        {entries.map((entry) => (
          <div className="guest-card" key={entry.id}>
            <img src={`/photos/${entry.photoFilename}`} alt={entry.name} />
            <div className="guest-card-body">
              <p className="guest-card-name">{entry.name}</p>
              {entry.notes && <p className="guest-card-notes">{entry.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
