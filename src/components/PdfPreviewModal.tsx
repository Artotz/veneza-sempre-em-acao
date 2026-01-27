import { useEffect, useState } from "react";
import i18n from "../i18n";

export type PdfPreviewPayload = { blob: Blob; filename: string };

type PdfPreviewModalProps = PdfPreviewPayload & { onClose: () => void };

export function PdfPreviewModal({ blob, filename, onClose }: PdfPreviewModalProps) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const pdfBlob =
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });

    const nextUrl = URL.createObjectURL(pdfBlob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  if (!url) return null;

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-surface text-foreground rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col border border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold">{filename}</span>
          <button
            onClick={onClose}
            aria-label={i18n.t("common.close", { defaultValue: "Fechar" })}
            className="rounded-lg border border-border-strong h-10 w-10 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {isMobile ? (
          <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-muted-foreground">
              A visualização de PDF não é suportada dentro do app no celular.
              Toque em "Abrir PDF" para visualizar em outra aba.
            </p>
            <button
              onClick={() => {
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="rounded-lg border border-border-strong px-3 py-1.5 bg-foreground text-surface font-semibold text-sm hover:opacity-90"
            >
              Abrir PDF
            </button>
          </div>
        ) : (
          <iframe
            src={url}
            title="Pré-visualização do PDF"
            className="flex-1 w-full border-0 rounded-b-xl"
          />
        )}
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={() => {
              const a = document.createElement("a");
              a.href = url;
              a.download = filename;
              a.click();
            }}
            className="rounded-lg border border-border-strong px-3 py-1.5 bg-foreground text-surface font-semibold text-sm hover:opacity-90"
          >
            {i18n.t("pdf.download", { defaultValue: "Baixar PDF" })}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
          >
            {i18n.t("common.close", { defaultValue: "Fechar" })}
          </button>
        </div>
      </div>
    </div>
  );
}
