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
const API_URL = (import.meta.env.VITE_API_URL || "https://wmuwh7dlg1.execute-api.us-east-1.amazonaws.com").replace(/\/$/, "");
const LOCAL_GUESTBOOK_PROXY = import.meta.env.DEV;

function requireApiUrl() {
  return API_URL;
}

function createDemoId() {
  return crypto.randomUUID();
}

export async function fetchEntries() {
  if (DEMO_MODE) return [...demoEntries];
  const response = LOCAL_GUESTBOOK_PROXY
    ? await fetch("/api/guestbook/entries")
    : await fetch(`${requireApiUrl()}/entries`);
  if (!response.ok) throw new Error("Could not load entries.");
  return response.json();
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

  const trimmedName = (name || "").trim();
  if (!trimmedName) throw new Error("Name is required.");
  if (!photoBlob) throw new Error("Photo is required.");
  if (!printImageBlob) throw new Error("Print image is required.");

  try {
    if (LOCAL_GUESTBOOK_PROXY) {
      const response = await fetch("/api/guestbook/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          notes: (notes || "").trim(),
          photo: await blobToBase64(photoBlob),
          printImage: await blobToBase64(printImageBlob),
        }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Could not save the guest entry.");
      }
      return response.json();
    }

    const apiUrl = requireApiUrl();
    const id = crypto.randomUUID();
    const uploadResponse = await fetch(`${apiUrl}/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!uploadResponse.ok) throw new Error("Could not prepare image uploads.");
    const { uploads } = await uploadResponse.json();

    await Promise.all([
      fetch(uploads.photo.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: photoBlob }).then(checkUpload),
      fetch(uploads.print.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: printImageBlob }).then(checkUpload),
    ]);

    const response = await fetch(`${apiUrl}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: trimmedName, notes: (notes || "").trim() }),
    });
    if (!response.ok) throw new Error("Could not save the guest entry.");
    return response.json();

  } catch (err) {
    console.error(err);
    const message = err.message || "Could not save entry. Check your connection and try again.";
    throw new Error(message, { cause: err });
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not encode an image for upload."));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read an image for upload."));
    reader.readAsDataURL(blob);
  });
}

function checkUpload(response) {
  if (!response.ok) throw new Error("Could not upload an image to AWS S3.");
}
