import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { uploadApontamentoImage } from "../services/storageUploads";
import {
  getPhotoBlob,
  listPendingPhotos,
  markUploaded,
  removePhotoBlob,
} from "../storage/offlinePhotos";

const REMOVE_BLOB_AFTER_UPLOAD = false;

type PendingUpload = {
  id: string;
  mime: string;
  size: number;
  kind?: string;
  consultantId?: string;
  apontamentoId?: string;
  entityRef?: string;
};

export const flushUploads = async (): Promise<void> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.warn("Sem internet.");
    return;
  }

  const pending = await listPendingPhotos();
  if (!pending.length) return;

  const supabase = createSupabaseBrowserClient();

  for (const item of pending as PendingUpload[]) {
    const apontamentoId = item.apontamentoId ?? item.entityRef;
    const kind = item.kind as "checkin" | "checkout" | "absence" | undefined;
    const consultantId = item.consultantId;

    if (!apontamentoId || !kind || !consultantId) {
      console.warn("Foto pendente sem metadados suficientes", item);
      continue;
    }

    const blob = await getPhotoBlob(item.id);
    if (!blob) {
      console.warn("Blob nao encontrado para foto pendente", item.id);
      continue;
    }

    try {
      const upload = await uploadApontamentoImage({
        apontamentoId,
        consultantId,
        kind,
        blob,
        mimeType: item.mime || blob.type || "image/jpeg",
      });

      const { error: insertError } = await supabase
        .from("apontamento_media")
        .insert({
          apontamento_id: apontamentoId,
          bucket: upload.bucket,
          path: upload.path,
          kind,
          mime_type: item.mime ?? blob.type ?? null,
          bytes: upload.bytes,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      await markUploaded(item.id, upload.path);

      if (REMOVE_BLOB_AFTER_UPLOAD) {
        await removePhotoBlob(item.id);
      }
    } catch (error) {
      console.warn("Falha ao sincronizar foto", error);
    }
  }
};
