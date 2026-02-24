import { createSupabaseBrowserClient } from "../lib/supabaseClient";

type UploadKind = "checkin" | "checkout" | "absence" | "registro";

type UploadArgs = {
  apontamentoId: string;
  consultantId: string;
  kind: UploadKind;
  blob: Blob;
  mimeType: string;
  originalName?: string;
};

export type UploadResult = {
  bucket: string;
  path: string;
  bytes: number;
};

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const extensionForMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  const mapping: Record<string, string> = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "pptx",
    "text/csv": "csv",
    "text/plain": "txt",
  };

  return mapping[normalized] ?? "bin";
};

const sanitizeFilename = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\\/]/g, "_");
};

const ensureExtension = (filename: string, extension: string) => {
  if (!filename) return filename;
  if (filename.includes(".")) return filename;
  return `${filename}.${extension}`;
};

export const uploadApontamentoImage = async (
  args: UploadArgs
): Promise<UploadResult> => {
  const supabase = createSupabaseBrowserClient();
  const bucket = "apontamentos";
  const extension = extensionForMime(args.mimeType);
  const sanitizedOriginal = args.originalName
    ? sanitizeFilename(args.originalName)
    : "";
  const filename = sanitizedOriginal
    ? ensureExtension(sanitizedOriginal, extension)
    : `${generateUuid()}.${extension}`;
  const uniqueFolder = sanitizedOriginal ? generateUuid() : null;
  const basePath = `consultants/${args.consultantId}/apontamentos/${args.apontamentoId}/${args.kind}`;
  const path = uniqueFolder
    ? `${basePath}/${uniqueFolder}/${filename}`
    : `${basePath}/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, args.blob, { contentType: args.mimeType, upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  return {
    bucket,
    path,
    bytes: args.blob.size,
  };
};
