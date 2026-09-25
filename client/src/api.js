import demoPortraitOne from "./assets/demo-portrait-one.png";
import demoPortraitTwo from "./assets/demo-portrait-two.png";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const demoEntries = DEMO_MODE
  ? [
      {
        id: "demo-emma",
        name: "Emma",
        notes: "Wishing you both a lifetime of happiness!",
        photoUrl: demoPortraitOne,
        printImageUrl: demoPortraitOne,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "demo-liam",
        name: "Liam",
        notes: "So happy to celebrate with you!",
        photoUrl: demoPortraitTwo,
        printImageUrl: demoPortraitTwo,
        createdAt: "2026-01-01T00:01:00.000Z",
      },
    ]
  : [];

function createDemoId() {
  return crypto.randomUUID();
}

export async function fetchEntries() {
  if (DEMO_MODE) return [...demoEntries];

  const res = await fetch("/api/entries");
  if (!res.ok) throw new Error("Could not load entries.");
  return res.json();
}

export async function saveEntry({ name, notes, photoBlob, printImageBlob }) {
  if (DEMO_MODE) {
    const id = createDemoId();
    const entry = {
      id,
      name,
      notes,
      photoUrl: URL.createObjectURL(photoBlob),
      printImageUrl: URL.createObjectURL(printImageBlob),
      createdAt: new Date().toISOString(),
    };
    demoEntries.push(entry);
    return entry;
  }

  const form = new FormData();
  form.append("name", name);
  form.append("notes", notes);
  form.append("photo", photoBlob, "photo.jpg");
  form.append("printImage", printImageBlob, "print-image.jpg");

  const res = await fetch("/api/entries", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save entry.");
  }
  return res.json();
}
