// Renders the guest's photo + name for the configured Brother label width.

import { PRINT_ARTWORK_HEIGHT_IN, PRINT_IMAGE_HEIGHT_IN, PRINT_PHOTO_HEIGHT_IN, PRINT_SCALE, PRINT_WIDTH_MM } from "./printConfig";

const DPI = 300;
const MM_PER_IN = 25.4;
const WIDTH_IN = PRINT_WIDTH_MM / MM_PER_IN;

function inchesToPx(inches, dpi = DPI) {
  return Math.round(inches * dpi);
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// Draws `img` into the given box using "cover" semantics (crop to fill,
// same as CSS object-fit: cover), matching how the on-screen preview crops.
function drawCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx, sy, sw, sh;

  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Greedy wrap: fill each line up to maxWidth, breaking at the last space on the
// line, or mid-word if there is no space.
function wrapName(ctx, name, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of name) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      const space = line.lastIndexOf(" ");
      if (space > 0) {
        lines.push(line.slice(0, space));
        line = line.slice(space + 1) + ch;
      } else {
        lines.push(line);
        line = ch;
      }
    } else {
      line += ch;
    }
  }
  lines.push(line);
  return lines.map((l) => l.trim()).filter(Boolean);
}

async function getPrintLayout(name, dpi = DPI) {
  const fontPx = Math.round((18 / 72) * dpi * PRINT_SCALE);
  await document.fonts.load(`600 ${fontPx}px "Caveat"`);
  await document.fonts.ready;

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  measureContext.font = `600 ${fontPx}px "Caveat", cursive`;
  const maxWidth = measureContext.measureText("ReallyLongNameWhoaT").width;
  const lines = wrapName(measureContext, name, maxWidth);
  const photoHeight = inchesToPx(PRINT_PHOTO_HEIGHT_IN, dpi) - (lines.length - 1) * fontPx;

  return { fontPx, lines, photoHeight };
}

export async function getPrintPhotoAspectRatio(name) {
  const { photoHeight } = await getPrintLayout(name);
  return inchesToPx(WIDTH_IN) / photoHeight;
}

export async function composePrintImage({ photoBlob, name, dpi = DPI }) {
  const canvas = document.createElement("canvas");
  canvas.width = inchesToPx(WIDTH_IN, dpi);
  canvas.height = inchesToPx(PRINT_IMAGE_HEIGHT_IN, dpi);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photo = await loadImageFromBlob(photoBlob);
  const { fontPx, lines, photoHeight } = await getPrintLayout(name, dpi);
  ctx.font = `600 ${fontPx}px "Caveat", cursive`;

  drawCover(ctx, photo, 0, 0, canvas.width, photoHeight);

  // Caption, centered in the remaining white strip at the bottom.
  ctx.fillStyle = "#2b2620";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const captionCenterY = photoHeight + (inchesToPx(PRINT_ARTWORK_HEIGHT_IN, dpi) - photoHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, captionCenterY + (i - (lines.length - 1) / 2) * fontPx);
  });

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}
