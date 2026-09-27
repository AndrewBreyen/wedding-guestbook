import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  query,
  orderBy,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
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

  const entriesQuery = query(collection(db, "entries"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(entriesQuery);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name,
      notes: data.notes,
      photoUrl: data.photoUrl,
      printImageUrl: data.printImageUrl,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
    };
  });
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

  const id = crypto.randomUUID();

  try {
    // Upload both images to Storage first, then write the Firestore doc once
    // we have their public download URLs.
    const photoRef = ref(storage, `photos/${id}-photo.jpg`);
    const printImageRef = ref(storage, `photos/${id}-print.jpg`);

    const [photoUpload, printImageUpload] = await Promise.all([
      uploadBytes(photoRef, photoBlob, { contentType: "image/jpeg" }),
      uploadBytes(printImageRef, printImageBlob, { contentType: "image/jpeg" }),
    ]);

    const [photoUrl, printImageUrl] = await Promise.all([
      getDownloadURL(photoUpload.ref),
      getDownloadURL(printImageUpload.ref),
    ]);

    const createdAt = new Date();
    const entryRef = doc(db, "entries", id);
    const entryData = {
      name: trimmedName,
      notes: (notes || "").trim(),
      photoUrl,
      printImageUrl,
      createdAt: Timestamp.fromDate(createdAt),
    };

    try {
      await setDoc(entryRef, entryData);
    } catch (writeError) {
      if (writeError.code === "permission-denied") throw writeError;

      // Firestore may have committed the write even when the client loses its
      // acknowledgment. Check this deterministic document before reporting a
      // failure, so a saved entry does not look like an unsuccessful save.
      const savedSnapshot = await getDocFromServer(entryRef);
      if (!savedSnapshot.exists()) throw writeError;
    }

    return {
      id,
      name: trimmedName,
      notes: (notes || "").trim(),
      photoUrl,
      printImageUrl,
      createdAt: createdAt.toISOString(),
    };
  } catch (err) {
    console.error(err);
    const message = err.code === "permission-denied"
      ? "Firestore denied this save. Check the Firestore security rules."
      : "Could not save entry. Check your connection and try again.";
    throw new Error(message, { cause: err });
  }
}
