// Renders the guest's photo + name for the configured Brother label width.

import { PRINT_ARTWORK_HEIGHT_IN, PRINT_IMAGE_HEIGHT_IN, PRINT_PHOTO_HEIGHT_IN, PRINT_SCALE, PRINT_WIDTH_MM } from "./printConfig";

const DPI = 300;
const MM_PER_IN = 25.4;
const WIDTH_IN = PRINT_WIDTH_MM / MM_PER_IN;

function inchesToPx(inches) {
  return Math.round(inches * DPI);
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

export async function composePrintImage({ photoBlob, name }) {
  const canvas = document.createElement("canvas");
  canvas.width = inchesToPx(WIDTH_IN);
  canvas.height = inchesToPx(PRINT_IMAGE_HEIGHT_IN);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photo = await loadImageFromBlob(photoBlob);

  const fontPx = Math.round((18 / 72) * DPI * PRINT_SCALE);
  await document.fonts.load(`600 ${fontPx}px "Caveat"`);
  await document.fonts.ready;
  ctx.font = `600 ${fontPx}px "Caveat", cursive`;

  // Names up to this width stay on one line; longer ones wrap onto more lines.
  const maxWidth = ctx.measureText("ReallyLongNameWhoaT").width;
  const lines = wrapName(ctx, name, maxWidth);

  // Each extra line takes its height from the photo so the label length stays the same.
  const photoH = inchesToPx(PRINT_PHOTO_HEIGHT_IN) - (lines.length - 1) * fontPx;
  drawCover(ctx, photo, 0, 0, canvas.width, photoH);

  // Caption, centered in the remaining white strip at the bottom.
  ctx.fillStyle = "#2b2620";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const captionCenterY = photoH + (inchesToPx(PRINT_ARTWORK_HEIGHT_IN) - photoH) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, captionCenterY + (i - (lines.length - 1) / 2) * fontPx);
  });

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}
