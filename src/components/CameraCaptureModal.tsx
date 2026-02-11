import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturePhotoResult } from "../services/camera";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { compressImage } from "../utils/photoCompress";

type CameraCaptureModalProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (shot: CapturePhotoResult) => void;
  onError?: (message: string) => void;
};

const mimeToExtension = (mimeType: string) => {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  return "jpg";
};

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
      reject(new Error("Nao foi possivel iniciar a camera."));
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
      reject(new Error("Nao foi possivel iniciar a camera."));
    };

    video.addEventListener("loadeddata", handleReady, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Nao foi possivel gerar a foto."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });

export const CameraCaptureModal = ({
  open,
  title = "Capturar foto",
  subtitle = "Aponte a camera e tire a foto.",
  onClose,
  onConfirm,
  onError,
}: CameraCaptureModalProps) => {
  useLockBodyScroll(open);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shot, setShot] = useState<CapturePhotoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setShot(null);
  }, []);

  const resetState = useCallback(() => {
    stopStream();
    clearPreview();
    setError(null);
    setIsStarting(false);
    setIsCapturing(false);
  }, [clearPreview, stopStream]);

  const startCamera = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIsStarting(true);
    setError(null);
    clearPreview();
    stopStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Camera indisponivel.";
      setError(message);
      onError?.(message);
      setIsStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn("Video play falhou", playError);
        }
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Nao foi possivel iniciar a camera.";
      setError(message);
      onError?.(message);
    } finally {
      setIsStarting(false);
    }
  }, [clearPreview, onError, stopStream]);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    void startCamera();
    return () => {
      resetState();
    };
  }, [open, resetState, startCamera]);

  const handleCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    setError(null);
    try {
      const video = videoRef.current;
      if (!video) {
        throw new Error("Camera indisponivel.");
      }

      await waitForVideoReady(video);

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Nao foi possivel acessar a camera.");
      }

      context.drawImage(video, 0, 0, width, height);
      const blob = await canvasToBlob(canvas);
      const compressedBlob = await compressImage(blob);
      const mimeType = compressedBlob.type || "image/jpeg";
      const nextShot: CapturePhotoResult = {
        blob: compressedBlob,
        mimeType,
        extension: mimeToExtension(mimeType),
      };
      const url = URL.createObjectURL(compressedBlob);
      previewUrlRef.current = url;
      setShot(nextShot);
      setPreviewUrl(url);
    } catch (captureError) {
      const message =
        captureError instanceof Error
          ? captureError.message
          : "Nao foi possivel capturar a foto.";
      setError(message);
      onError?.(message);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleConfirm = () => {
    if (!shot) return;
    onConfirm(shot);
  };

  const handleRetake = () => {
    clearPreview();
    setError(null);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-foreground-muted">{subtitle}</p>
        </div>

        <div className="px-5 py-4">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-muted">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview da foto"
                className="h-64 w-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-64 w-full object-cover"
              />
            )}
            {isStarting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-semibold text-white">
                Abrindo camera...
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
          >
            Fechar
          </button>
          <div className="flex flex-wrap gap-2">
            {shot ? (
              <button
                type="button"
                onClick={handleRetake}
                className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground"
              >
                Nova foto
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCapture}
                disabled={isStarting || isCapturing}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  isStarting || isCapturing
                    ? "cursor-not-allowed bg-surface-muted text-foreground-muted"
                    : "bg-accent text-white"
                }`}
              >
                Tirar foto
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!shot}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                shot
                  ? "bg-success text-white"
                  : "cursor-not-allowed bg-surface-muted text-foreground-muted"
              }`}
            >
              Usar foto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
