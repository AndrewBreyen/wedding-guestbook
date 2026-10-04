// Sends the composed print image to the Brother VC-500W via the dev server's
// /api/direct-print endpoint (see client/printer-plugin.js), which turns on
// auto full cut. Enabled by launch.sh when PRINTER_HOST is set.
import { PRINT_WIDTH_MM } from "./printConfig";

export const DIRECT_PRINT_ENABLED = import.meta.env.VITE_DIRECT_PRINT === "1";

// Pixel density the image is resampled to before sending. 313 is the VC-500W's
// nominal resolution; adjust with VITE_DIRECT_PRINT_DPI if prints are scaled wrong.
const TARGET_DPI = Number(import.meta.env.VITE_DIRECT_PRINT_DPI || 313);

export async function directPrint(imageBlob, copies = 1) {
  const bitmap = await createImageBitmap(imageBlob);
  const width = Math.round((PRINT_WIDTH_MM / 25.4) * TARGET_DPI);
  const height = Math.round(bitmap.height * (width / bitmap.width));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  // RGBA -> packed RGB (the printer's "rawrgb" format).
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
  }

  const res = await fetch(`/api/direct-print?width=${width}&height=${height}&copies=${copies}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: rgb,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Direct print failed (${res.status}).`);
  }
}

// Returns true if the job was sent; false means the caller should fall back to
// the normal window.print() path.
export async function tryDirectPrint(imageBlob) {
  if (!DIRECT_PRINT_ENABLED) return false;
  try {
    await directPrint(imageBlob);
    return true;
  } catch (err) {
    console.error("Direct print failed, falling back to window.print():", err);
    return false;
  }
}
