// Rendered off-screen until window.print() is called.
export default function PrintCard({ entry }) {
  if (!entry) return null;

  return (
    <>
      <style>{`
        :root {
          --print-width: ${entry.widthMm}mm;
          --print-height: ${entry.heightIn}in;
          --print-artwork-height: ${entry.artworkHeightIn}in;
        }
        @page { size: ${entry.widthMm}mm ${entry.heightIn}in; margin: 0; }
      `}</style>
      <div className="print-only">
        <img src={entry.printImageUrl} alt="Guestbook photo" className="guest-print-img" />
      </div>
    </>
  );
}
