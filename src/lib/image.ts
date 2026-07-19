// Image file handling: client-side downscale + blob/dataURL conversion.

const MAX_LONG_EDGE = 2048;

export interface ProcessedImage {
  blob: Blob;
  natW: number; // dimensions of the stored (possibly downscaled) bitmap
  natH: number;
}

/** Downscale so the long edge is at most 2048 px; JPEG q0.85 for photos,
 * PNG stays PNG (screenshots, scans with sharp lines). */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file);
  const long = Math.max(bitmap.width, bitmap.height);
  const f = long > MAX_LONG_EDGE ? MAX_LONG_EDGE / long : 1;
  const w = Math.round(bitmap.width * f);
  const h = Math.round(bitmap.height * f);

  if (f === 1) {
    bitmap.close();
    return { blob: file, natW: w, natH: h };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const isPng = file.type === "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("image encode failed"))),
      isPng ? "image/png" : "image/jpeg",
      isPng ? undefined : 0.85,
    );
  });
  return { blob, natW: w, natH: h };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const mime = meta.slice(meta.indexOf(":") + 1, meta.indexOf(";"));
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "image/jpeg" });
}
