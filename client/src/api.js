export async function fetchEntries() {
  const res = await fetch("/api/entries");
  if (!res.ok) throw new Error("Could not load entries.");
  return res.json();
}

export async function saveEntry({ name, notes, photoBlob, printImageBlob }) {
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
