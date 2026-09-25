// Renders the guest's photo + name into a single flattened image, sized to
// print at exactly 4x6in at 300dpi. This is what gets saved to disk and
// printed — a real file, not just a CSS layout, so what's saved matches
// exactly what came out of the printer.

const DPI = 300;
const WIDTH_IN = 4;
const HEIGHT_IN = 6;
const PADDING_IN = 0.28;
const PHOTO_HEIGHT_IN = 4.6;

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

export async function composePolaroid({ photoBlob, name }) {
  const canvas = document.createElement("canvas");
  canvas.width = inchesToPx(WIDTH_IN);
  canvas.height = inchesToPx(HEIGHT_IN);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photo = await loadImageFromBlob(photoBlob);

  const padding = inchesToPx(PADDING_IN);
  const photoW = canvas.width - padding * 2;
  const photoH = inchesToPx(PHOTO_HEIGHT_IN);
  drawCover(ctx, photo, padding, padding, photoW, photoH);

  // Caption, centered in the remaining white strip at the bottom.
  const fontPx = Math.round((40 / 96) * DPI); // 40 CSS px -> canvas px at 300dpi
  await document.fonts.load(`600 ${fontPx}px "Caveat"`);
  await document.fonts.ready;

  ctx.fillStyle = "#2b2620";
  ctx.font = `600 ${fontPx}px "Caveat", cursive`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const captionTop = padding + photoH;
  const captionCenterY = captionTop + (canvas.height - captionTop) / 2;
  ctx.fillText(name, canvas.width / 2, captionCenterY);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}
