import { useState } from "react";
import Welcome from "./screens/Welcome.jsx";
import Capture from "./screens/Capture.jsx";
import Confirm from "./screens/Confirm.jsx";
import Thanks from "./screens/Thanks.jsx";
import ViewAll from "./screens/ViewAll.jsx";
import PrintCard from "./screens/PrintCard.jsx";
import { saveEntry } from "./api";
import { composePrintImage } from "./composePrintImage";

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
    // Save the original capture and a composed 2x3in print image.
    const printImageBlob = await composePrintImage({ photoBlob: draft.photoBlob, name: draft.name });
    const saved = await saveEntry({ ...draft, printImageBlob });

    // Make sure the saved print image is actually loaded before we print —
    // otherwise window.print() can fire while the <img> is still fetching.
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve; // don't block printing forever if this fails
      img.src = saved.printImageUrl || `/photos/${saved.printImageFilename}`;
    });

    setPrintEntry({ printImageUrl: saved.printImageUrl || `/photos/${saved.printImageFilename}` });
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
