// Rendered off-screen at all times; only becomes visible via the @media print
// rules in styles.css when window.print() is called. The polaroid image is
// already fully composed (photo + name baked in) by composePolaroid.js, so
// this just prints it full-bleed at its native 4x6in size.
export default function PrintCard({ entry }) {
  if (!entry) return null;

  return (
    <div className="print-only">
      <img src={entry.polaroidUrl} alt="Guestbook polaroid" className="polaroid-print-img" />
    </div>
  );
}
