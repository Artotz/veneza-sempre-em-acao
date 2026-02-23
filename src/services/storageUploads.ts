import { createSupabaseBrowserClient } from "../lib/supabaseClient";

type UploadKind = "checkin" | "checkout" | "absence" | "registro";

type UploadArgs = {
  apontamentoId: string;
  consultantId: string;
  kind: UploadKind;
  blob: Blob;
  mimeType: string;
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

export const uploadApontamentoImage = async (
  args: UploadArgs
): Promise<UploadResult> => {
  const supabase = createSupabaseBrowserClient();
  const bucket = "apontamentos";
  const filename = `${generateUuid()}.${extensionForMime(args.mimeType)}`;
  const path = `consultants/${args.consultantId}/apontamentos/${args.apontamentoId}/${args.kind}/${filename}`;

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
