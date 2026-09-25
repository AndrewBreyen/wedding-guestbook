import { useState } from "react";
import Welcome from "./screens/Welcome.jsx";
import Capture from "./screens/Capture.jsx";
import Confirm from "./screens/Confirm.jsx";
import Thanks from "./screens/Thanks.jsx";
import ViewAll from "./screens/ViewAll.jsx";
import PrintCard from "./screens/PrintCard.jsx";
import { saveEntry } from "./api";
import { composePolaroid } from "./composePolaroid";

const EMPTY_DRAFT = { name: "", notes: "", photoBlob: null };

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [printEntry, setPrintEntry] = useState(null);
  const [savedName, setSavedName] = useState("");

  function goHome() {
    setScreen("welcome");
    setDraft(EMPTY_DRAFT);
  }

  function handleTakePhoto({ name, notes, photoBlob }) {
    setDraft({ name, notes, photoBlob });
    setScreen("confirm");
  }

  async function handleConfirm() {
    // Bake the photo + name into a single 4x6in image first — this is both
    // what gets saved as the "final" print and what gets sent to the printer.
    const polaroidBlob = await composePolaroid({ photoBlob: draft.photoBlob, name: draft.name });
    const saved = await saveEntry({ ...draft, polaroidBlob });
    const polaroidUrl = `/photos/${saved.polaroidFilename}`;

    // Make sure the saved polaroid image is actually loaded before we print —
    // otherwise window.print() can fire while the <img> is still fetching.
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve; // don't block printing forever if this fails
      img.src = polaroidUrl;
    });

    setPrintEntry({ polaroidUrl });
    setSavedName(saved.name);

    // With Chrome launched using --kiosk-printing this skips the print dialog.
    requestAnimationFrame(() => {
      window.print();
      setScreen("thanks");
    });
  }

  return (
    <div className="app">
      {screen === "welcome" && (
        <Welcome onStart={() => setScreen("capture")} onViewAll={() => setScreen("viewAll")} />
      )}

      {screen === "capture" && (
        <Capture draft={draft} onTakePhoto={handleTakePhoto} onCancel={goHome} />
      )}

      {screen === "confirm" && (
        <Confirm draft={draft} onRetake={() => setScreen("capture")} onConfirm={handleConfirm} />
      )}

      {screen === "thanks" && <Thanks name={savedName} onDone={goHome} />}

      {screen === "viewAll" && <ViewAll onBack={goHome} />}

      <PrintCard entry={printEntry} />
    </div>
  );
}
