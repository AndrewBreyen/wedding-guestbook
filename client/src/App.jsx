import { useEffect, useRef, useState } from "react";
import Welcome from "./screens/Welcome.jsx";
import Capture from "./screens/Capture.jsx";
import Confirm from "./screens/Confirm.jsx";
import Thanks from "./screens/Thanks.jsx";
import ViewAll from "./screens/ViewAll.jsx";
import PrintCard from "./screens/PrintCard.jsx";
import DisposableCamera from "./screens/DisposableCamera.jsx";
import CameraAdmin from "./screens/CameraAdmin.jsx";
import { saveEntry } from "./api";
import { composePrintImage } from "./composePrintImage";
import { composeCalibrationImage } from "./composeCalibrationImage";
import { tryDirectPrint } from "./directPrint";
import { PRINT_CARD_HEIGHT_IN, PRINT_HEIGHT_IN, PRINT_WIDTH_MM } from "./printConfig";
import demoPortrait from "./assets/demo-portrait-one.png";

const EMPTY_DRAFT = { name: "", notes: "", photoBlob: null };
const PRINT_TEST_MODE = import.meta.env.VITE_PRINT_TEST_MODE === "1";
const DIRECT_PRINT_ENABLED = import.meta.env.VITE_DIRECT_PRINT === "1";

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const returnToGuestbook = () => { window.location.href = window.location.pathname; };
  if (query.get("camera-admin") === "1") return <CameraAdmin onBack={returnToGuestbook} />;
  if (query.get("camera") === "1") return <DisposableCamera onBack={returnToGuestbook} />;
  return <GuestbookApp />;
}

function GuestbookApp() {
  const [screen, setScreen] = useState("welcome");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [printEntry, setPrintEntry] = useState(null);
  const [savedName, setSavedName] = useState("");
  const [printPreview, setPrintPreview] = useState(null);
  const previewTimer = useRef(null);
  const previewUrl = useRef(null);

  function announceSimulatedPrint(imageBlob) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(imageBlob);
    previewUrl.current = url;
    setPrintPreview({
      url,
      route: DIRECT_PRINT_ENABLED ? "over the network" : "through macOS",
    });
    previewTimer.current = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      previewUrl.current = null;
      previewTimer.current = null;
      setPrintPreview(null);
    }, 6000);
  }

  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function goHome() {
    setScreen("welcome");
    setDraft(EMPTY_DRAFT);
  }

  function handleTakePhoto({ name, notes, photoBlob }) {
    setDraft({ name, notes, photoBlob });
    setScreen("confirm");
  }

  async function handleConfirm() {
    // Compose the print image before choosing the real-save or test-mode path.
    const printImageBlob = await composePrintImage({ photoBlob: draft.photoBlob, name: draft.name });

    if (PRINT_TEST_MODE) {
      announceSimulatedPrint(printImageBlob);
      setSavedName(draft.name);
      setScreen("thanks");
      return;
    }

    const saved = await saveEntry({ ...draft, printImageBlob });

    // Preferred path: send straight to the printer with auto cut (needs PRINTER_HOST).
    if (await tryDirectPrint(printImageBlob)) {
      setSavedName(saved.name);
      setScreen("thanks");
      return;
    }

    // Make sure the saved print image loaded before opening the print pipeline.
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = () => reject(new Error("Unable to load the print image."));
      img.src = saved.printImageUrl || `/photos/${saved.printImageFilename}`;
    });

    setPrintEntry({
      printImageUrl: saved.printImageUrl || `/photos/${saved.printImageFilename}`,
      widthMm: PRINT_WIDTH_MM,
      heightIn: PRINT_CARD_HEIGHT_IN,
      artworkHeightIn: PRINT_CARD_HEIGHT_IN,
    });
    setSavedName(saved.name);

    // With Chrome launched using --kiosk-printing this skips the print dialog.
    requestAnimationFrame(() => {
      window.print();
      setScreen("thanks");
    });
  }

  async function handleDemoPrint() {
    const photoBlob = await fetch(demoPortrait).then((response) => response.blob());
    const printImageBlob = await composePrintImage({ photoBlob, name: "Test print" });
    await printTestImage(printImageBlob, PRINT_CARD_HEIGHT_IN);
  }

  async function handleCalibrationPrint() {
    const printImageBlob = await composeCalibrationImage();
    if (!printImageBlob) throw new Error("Unable to create the calibration image.");
    await printTestImage(printImageBlob);
  }

  async function printTestImage(printImageBlob, heightIn = PRINT_HEIGHT_IN) {
    if (PRINT_TEST_MODE) {
      announceSimulatedPrint(printImageBlob);
      return;
    }
    if (await tryDirectPrint(printImageBlob)) return;

    const printImageUrl = URL.createObjectURL(printImageBlob);

    setPrintEntry({
      printImageUrl,
      widthMm: PRINT_WIDTH_MM,
      heightIn,
      artworkHeightIn: heightIn,
    });

    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => reject(new Error("Unable to load the demo print image."));
        img.src = printImageUrl;
      });
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          window.print();
          resolve();
        });
      });
    } finally {
      URL.revokeObjectURL(printImageUrl);
      setPrintEntry(null);
    }
  }

  return (
    <div className="app">
      {screen === "welcome" && (
        <Welcome onStart={() => setScreen("capture")} onViewAll={() => setScreen("viewAll")} onDisposableCamera={() => {
          const url = new URL(window.location.href);
          url.search = "?camera=1";
          window.location.assign(url);
        }} />
      )}

      {screen === "capture" && (
        <Capture
          draft={draft}
          onTakePhoto={handleTakePhoto}
          onCancel={goHome}
          onDemoPrint={handleDemoPrint}
          onCalibrationPrint={handleCalibrationPrint}
        />
      )}

      {screen === "confirm" && (
        <Confirm draft={draft} onRetake={() => setScreen("capture")} onConfirm={handleConfirm} />
      )}

      {screen === "thanks" && <Thanks name={savedName} onDone={goHome} />}

      {screen === "viewAll" && <ViewAll onBack={goHome} />}

      <PrintCard entry={printEntry} />
      {printPreview && (
        <div className="print-test-preview" role="status">
          <img src={printPreview.url} alt="Preview of the simulated print" />
          <span>Test mode. Not saving record. Would print {printPreview.route}</span>
        </div>
      )}
    </div>
  );
}
