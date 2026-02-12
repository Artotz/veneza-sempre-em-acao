export type CompressOptions = {
  maxW?: number;
  maxH?: number;
  quality?: number;
};

type Canvas2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

const DEFAULT_MAX_W = 1600;
const DEFAULT_MAX_H = 1600;
const DEFAULT_QUALITY = 0.78;

const isOffscreenCanvas = (
  canvas: HTMLCanvasElement | OffscreenCanvas
): canvas is OffscreenCanvas =>
  typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;

const createCanvas = (width: number, height: number) => {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function"
  ) {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document === "undefined") {
    throw new Error("Canvas indisponivel neste ambiente.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const canvasToBlob = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
) => {
  if (isOffscreenCanvas(canvas)) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) => {
        if (!blob) {
          reject(new Error("Nao foi possivel gerar a imagem comprimida."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
};

const loadImageBitmap = async (input: Blob) => {
  if (typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(input);
    return bitmap;
  } catch (error) {
    console.warn("Falha ao decodificar imagem", error);
    return null;
  }
};

const loadImageElement = (input: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(input);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    img.onload = () => {
      cleanup();
      resolve(img);
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Nao foi possivel processar a imagem."));
    };

    img.src = url;
  });

const tryEncode = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
) => {
  try {
    const blob = await canvasToBlob(canvas, type, quality);
    if (blob.type === type) {
      return blob;
    }
  } catch (error) {
    console.warn("Falha ao codificar imagem", error);
  }

  return null;
};

const get2dContext = (
  canvas: HTMLCanvasElement | OffscreenCanvas
): Canvas2DContext | null => {
  if (isOffscreenCanvas(canvas)) {
    return canvas.getContext("2d");
  }

  return canvas.getContext("2d");
};

export const compressImage = async (
  input: Blob,
  opts: CompressOptions = {}
): Promise<Blob> => {
  const maxW = opts.maxW ?? DEFAULT_MAX_W;
  const maxH = opts.maxH ?? DEFAULT_MAX_H;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const bitmap = await loadImageBitmap(input);

  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource;
  let cleanup: (() => void) | null = null;

  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    drawSource = bitmap;
    cleanup = () => {
      if ("close" in bitmap) {
        bitmap.close();
      }
    };
  } else {
    const img = await loadImageElement(input);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    drawSource = img;
  }

  if (!width || !height) {
    throw new Error("Nao foi possivel ler o tamanho da imagem.");
  }

  const scale = Math.min(maxW / width, maxH / height, 1);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = createCanvas(targetW, targetH);
  const context = get2dContext(canvas);
  if (!context) {
    cleanup?.();
    throw new Error("Nao foi possivel processar a imagem.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(drawSource, 0, 0, targetW, targetH);

  cleanup?.();

  const webp = await tryEncode(canvas, "image/webp", quality);
  if (webp) return webp;

  const jpeg = await tryEncode(canvas, "image/jpeg", quality);
  if (jpeg) return jpeg;

  throw new Error("Nao foi possivel comprimir a imagem.");
};
