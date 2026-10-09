export default function PrintPreviewImage({ src, alt, large = false }) {
  return <img className={`print-preview-image${large ? " print-preview-image-large" : ""}`} src={src} alt={alt} />;
}
