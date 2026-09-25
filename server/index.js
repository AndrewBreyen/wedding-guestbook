import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");
const ENTRIES_FILE = path.join(DATA_DIR, "entries.json");
const PORT = process.env.PORT || 4000;

// Make sure our storage folders/files exist before we accept any requests.
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(ENTRIES_FILE)) {
  fs.writeFileSync(ENTRIES_FILE, "[]");
}

function readEntries() {
  try {
    const raw = fs.readFileSync(ENTRIES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json());
app.use("/photos", express.static(PHOTOS_DIR));

// List all guestbook entries, newest first.
app.get("/api/entries", (req, res) => {
  const entries = readEntries().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(entries);
});

// Save a new entry: name + notes (text), the raw photo the camera took, and
// the fully composed 4x6in polaroid image (photo + name baked in) that was
// sent to the printer. Both images are kept on disk.
app.post(
  "/api/entries",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "polaroid", maxCount: 1 },
  ]),
  (req, res) => {
    const { name, notes } = req.body;
    const photoFile = req.files?.photo?.[0];
    const polaroidFile = req.files?.polaroid?.[0];

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (!photoFile) {
      return res.status(400).json({ error: "Photo is required." });
    }
    if (!polaroidFile) {
      return res.status(400).json({ error: "Polaroid image is required." });
    }

    const id = crypto.randomUUID();
    const photoFilename = `${id}-photo.jpg`;
    const polaroidFilename = `${id}-polaroid.jpg`;
    fs.writeFileSync(path.join(PHOTOS_DIR, photoFilename), photoFile.buffer);
    fs.writeFileSync(path.join(PHOTOS_DIR, polaroidFilename), polaroidFile.buffer);

    const entry = {
      id,
      name: name.trim(),
      notes: (notes || "").trim(),
      photoFilename,
      polaroidFilename,
      createdAt: new Date().toISOString(),
    };

    const entries = readEntries();
    entries.push(entry);
    writeEntries(entries);

    res.status(201).json(entry);
  }
);

app.listen(PORT, () => {
  console.log(`Guestbook server running at http://localhost:${PORT}`);
  console.log(`Entries are saved to: ${ENTRIES_FILE}`);
  console.log(`Photos are saved to:  ${PHOTOS_DIR}`);
});
