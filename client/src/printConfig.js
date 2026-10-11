const configuredWidth = import.meta.env.VITE_PRINT_WIDTH_MM || "50";

if (configuredWidth !== "25" && configuredWidth !== "50") {
  throw new Error("VITE_PRINT_WIDTH_MM must be either 25 or 50.");
}

export const PRINT_WIDTH_MM = Number(configuredWidth);
export const PRINT_SCALE = PRINT_WIDTH_MM / 50;
export const PRINT_HEIGHT_IN = PRINT_WIDTH_MM === 25 ? 1.33 : 2.53;
export const PRINT_OUTPUT_SCALE = PRINT_WIDTH_MM === 25 ? 0.9 : 1;
export const PRINT_BOTTOM_PADDING_IN = PRINT_WIDTH_MM === 25 ? 0.1 : 0;
export const PRINT_CARD_HEIGHT_IN = PRINT_HEIGHT_IN + PRINT_BOTTOM_PADDING_IN;
export const PRINT_ARTWORK_HEIGHT_IN = PRINT_HEIGHT_IN / PRINT_OUTPUT_SCALE;
export const PRINT_IMAGE_HEIGHT_IN = PRINT_ARTWORK_HEIGHT_IN + PRINT_BOTTOM_PADDING_IN / PRINT_OUTPUT_SCALE;
export const PRINT_CAPTION_HEIGHT_IN = 0.34 * PRINT_SCALE;
export const PRINT_PHOTO_HEIGHT_IN = PRINT_ARTWORK_HEIGHT_IN - PRINT_CAPTION_HEIGHT_IN;
