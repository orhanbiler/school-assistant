import { MAX_PHOTO_BYTES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/request-limits";

export async function preparePhoto(file: File, rotation = 0): Promise<File> {
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error("Choose a photo under 20 MB. Crop to one textbook page for clearer text.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error("This photo format could not be opened. Save it as JPEG or PNG, or choose a screenshot."); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error("This photo is too large to process. Crop to a single page and try again.");
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const sideways = rotation % 180 !== 0;
    canvas.width = sideways ? height : width;
    canvas.height = sideways ? width : height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The photo reader could not start. Reload the page and try again.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(image, -width / 2, -height / 2, width, height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared. Choose a different image.")), "image/jpeg", quality));
    let blob = await encode(0.9);
    if (blob.size > MAX_IMAGE_UPLOAD_BYTES) blob = await encode(0.75);
    canvas.width = canvas.height = 0;
    if (blob.size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("This photo is still too large. Crop to one page and try again.");
    return new File([blob], "textbook-page.jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
