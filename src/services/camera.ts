import { compressImage } from "../utils/photoCompress";
import { t } from "../i18n";

export type CapturePhotoResult = {
  blob: Blob;
  mimeType: string;
  extension: string;
};

const jpegMimeType = "image/jpeg";
const jpegExtension = "jpg";

const mimeToExtension = (mimeType: string) => {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  return jpegExtension;
};

const ensureBrowser = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(t("Captura de foto indisponivel neste ambiente."));
  }
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality = 0.92
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(t("Nao foi possivel gerar a foto.")));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });

const waitForVideoReady = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      resolve();
      return;
    }

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(t("Nao foi possivel iniciar a camera.")));
    }, 3000);

    const handleReady = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error(t("Nao foi possivel iniciar a camera.")));
    };

    video.addEventListener("loadeddata", handleReady, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });

const captureWithStream = async (): Promise<Blob> => {
  ensureBrowser();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t("Camera indisponivel."));
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  try {
    const [track] = stream.getVideoTracks();

    if (track && "ImageCapture" in window) {
      const ImageCaptureCtor = (window as typeof window & {
        ImageCapture?: new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> };
      }).ImageCapture;

      if (ImageCaptureCtor) {
        const imageCapture = new ImageCaptureCtor(track);
        const photo = await imageCapture.takePhoto();
        return photo;
      }
    }

    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;

    try {
      await video.play();
    } catch (error) {
      console.warn("Video play falhou", error);
    }

    await waitForVideoReady(video);

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(t("Nao foi possivel acessar a camera."));
    }

    context.drawImage(video, 0, 0, width, height);
    return await canvasToBlob(canvas, jpegMimeType, 0.9);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};

const loadImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
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
      reject(new Error(t("Nao foi possivel processar a imagem.")));
    };

    img.src = url;
  });

const ensureJpeg = async (blob: Blob): Promise<Blob> => {
  if (blob.type === jpegMimeType || blob.type === "image/jpg") {
    return blob;
  }

  ensureBrowser();

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(t("Nao foi possivel processar a imagem."));
    }
    context.drawImage(bitmap, 0, 0);
    if ("close" in bitmap) {
      bitmap.close();
    }
    return await canvasToBlob(canvas, jpegMimeType, 0.9);
  }

  const img = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(t("Nao foi possivel processar a imagem."));
  }
  context.drawImage(img, 0, 0);
  return await canvasToBlob(canvas, jpegMimeType, 0.9);
};

export const capturePhoto = async (): Promise<CapturePhotoResult> => {
  ensureBrowser();
  const streamBlob = await captureWithStream();
  const jpegBlob = await ensureJpeg(streamBlob);
  const compressedBlob = await compressImage(jpegBlob);
  const mimeType = compressedBlob.type || jpegMimeType;
  return {
    blob: compressedBlob,
    mimeType,
    extension: mimeToExtension(mimeType),
  };
};


