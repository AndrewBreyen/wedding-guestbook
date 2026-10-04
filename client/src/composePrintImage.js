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

export async function composePrintImage({ photoBlob, name }) {
  const canvas = document.createElement("canvas");
  canvas.width = inchesToPx(WIDTH_IN);
  canvas.height = inchesToPx(PRINT_IMAGE_HEIGHT_IN);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photo = await loadImageFromBlob(photoBlob);

  const photoH = inchesToPx(PRINT_PHOTO_HEIGHT_IN);
  drawCover(ctx, photo, 0, 0, canvas.width, photoH);

  // Caption, centered in the remaining white strip at the bottom.
  const fontPx = Math.round((18 / 72) * DPI * PRINT_SCALE);
  await document.fonts.load(`600 ${fontPx}px "Caveat"`);
  await document.fonts.ready;

  ctx.fillStyle = "#2b2620";
  ctx.font = `600 ${fontPx}px "Caveat", cursive`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const captionTop = photoH;
  const captionCenterY = captionTop + (inchesToPx(PRINT_ARTWORK_HEIGHT_IN) - captionTop) / 2;
  ctx.fillText(name, canvas.width / 2, captionCenterY);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, canvas.height - 2, canvas.width, 2);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}
