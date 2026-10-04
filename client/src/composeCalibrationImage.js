import { PRINT_HEIGHT_IN, PRINT_ARTWORK_HEIGHT_IN, PRINT_WIDTH_MM } from "./printConfig";

const DPI = 300;
const MM_PER_IN = 25.4;

export function composeCalibrationImage() {
  const widthIn = PRINT_WIDTH_MM / MM_PER_IN;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthIn * DPI);
  canvas.height = Math.round(PRINT_ARTWORK_HEIGHT_IN * DPI);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = 2;

  const inset = Math.round(DPI / 32);
  ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);

  ctx.font = `${Math.round(DPI / 20)}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(`${PRINT_WIDTH_MM} mm x ${PRINT_HEIGHT_IN} in`, inset * 2, inset * 2);

  const rulerX = Math.round(DPI / 5);
  const rulerTop = Math.round(DPI * 0.45);
  const rulerBottom = rulerTop + DPI;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rulerX, rulerTop);
  ctx.lineTo(rulerX, rulerBottom);
  ctx.stroke();

  for (let tick = 0; tick <= 8; tick += 1) {
    const y = rulerTop + (DPI * tick) / 8;
    const tickLength = tick % 2 === 0 ? 30 : 18;
    ctx.beginPath();
    ctx.moveTo(rulerX - tickLength, y);
    ctx.lineTo(rulerX + tickLength, y);
    ctx.stroke();
  }

  ctx.font = `bold ${Math.round(DPI / 18)}px sans-serif`;
  ctx.fillText("1.00 IN", rulerX + Math.round(DPI / 6), rulerTop - Math.round(DPI / 8));

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}