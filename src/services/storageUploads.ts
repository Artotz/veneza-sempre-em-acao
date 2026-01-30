import { createSupabaseBrowserClient } from "../lib/supabaseClient";

type UploadKind = "checkin" | "checkout" | "absence";

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

export const uploadApontamentoImage = async (
  args: UploadArgs
): Promise<UploadResult> => {
  const supabase = createSupabaseBrowserClient();
  const bucket = "apontamentos";
  const filename = `${generateUuid()}.jpg`;
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
