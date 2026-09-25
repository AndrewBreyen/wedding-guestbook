// Rendered off-screen until window.print() is called. The photo and caption
// are already composed into a 2x3in image.
export default function PrintCard({ entry }) {
  if (!entry) return null;

  return (
    <div className="print-only">
      <img src={entry.printImageUrl} alt="Guestbook photo" className="guest-print-img" />
    </div>
  );
}
