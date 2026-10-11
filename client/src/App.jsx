import { useEffect, useRef, useState } from "react";
import Welcome from "./screens/Welcome.jsx";
import Capture from "./screens/Capture.jsx";
import Confirm from "./screens/Confirm.jsx";
import Thanks from "./screens/Thanks.jsx";
import ViewAll from "./screens/ViewAll.jsx";
import PrintPreviewImage from "./PrintPreviewImage.jsx";
import { saveEntry } from "./api";
import { composePrintImage } from "./composePrintImage";
import { composeCalibrationImage } from "./composeCalibrationImage";
import { directPrint } from "./directPrint";
import { PRINT_HEIGHT_IN } from "./printConfig";
import demoPortrait from "./assets/demo-portrait-one.png";

const EMPTY_DRAFT = { name: "", notes: "", photoBlob: null, photoAspectRatio: null, isDemo: false };
const PRINT_TEST_MODE = import.meta.env.VITE_PRINT_TEST_MODE === "1";

export default function App() {
  return (
    <>
      {PRINT_TEST_MODE && (
        <div className="test-mode-banner" role="status">
          TEST MODE — Nothing will be saved or printed
        </div>
      )}
      <GuestbookApp />
    </>
  );
}

function GuestbookApp() {
  const [screen, setScreen] = useState("welcome");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [savedName, setSavedName] = useState("");
  const [printPreview, setPrintPreview] = useState(null);
  const savedEntry = useRef(null);
  const previewTimer = useRef(null);
  const previewUrl = useRef(null);

  function announceSimulatedPrint(imageBlob) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(imageBlob);
    previewUrl.current = url;
    setPrintPreview({
      url,
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
    savedEntry.current = null;
  }

  function handleTakePhoto({ name, notes, photoBlob, photoAspectRatio }) {
    savedEntry.current = null;
    setDraft({ name, notes, photoBlob, photoAspectRatio, isDemo: false });
    setScreen("confirm");
  }

  async function handleConfirm(printImageBlob) {
    if (PRINT_TEST_MODE) {
      announceSimulatedPrint(printImageBlob);
      setSavedName(draft.name);
      setScreen("thanks");
      return;
    }

    if (draft.isDemo) {
      try {
        await directPrint(printImageBlob);
      } catch (err) {
        throw new Error(`Network demo print failed: ${err.message}`, { cause: err });
      }
      setSavedName(draft.name);
      setScreen("thanks");
      return;
    }

    let saved = savedEntry.current;
    if (!saved) {
      saved = await saveEntry({ ...draft, printImageBlob });
      savedEntry.current = saved;
    }

    try {
      await directPrint(printImageBlob);
    } catch (err) {
      throw new Error(`Your entry was saved, but network printing failed: ${err.message}`, { cause: err });
    }
    setSavedName(saved.name);
    setScreen("thanks");
  }

  async function handleDemoPrint(name) {
    const photoBlob = await fetch(demoPortrait).then((response) => response.blob());
    savedEntry.current = null;
    setDraft({
      name: name || "Test print",
      notes: "",
      photoBlob,
      photoAspectRatio: null,
      isDemo: true,
    });
    setScreen("confirm");
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
    await directPrint(printImageBlob);
  }

  return (
    <div className={`app${PRINT_TEST_MODE ? " app-test-mode" : ""}`}>
      {screen === "welcome" && <Welcome onStart={() => setScreen("capture")} onViewAll={() => setScreen("viewAll")} />}

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
        <Confirm
          draft={draft}
          onRetake={() => setScreen("capture")}
          onConfirm={handleConfirm}
        />
      )}

      {screen === "thanks" && <Thanks name={savedName} onDone={goHome} />}

      {screen === "viewAll" && <ViewAll onBack={goHome} />}

      {printPreview && (
        <div className="print-test-preview" role="status">
          <PrintPreviewImage src={printPreview.url} alt="Preview of the simulated print" />
          <span>Simulated print preview. Not saved or printed.</span>
        </div>
      )}
    </div>
  );
}
