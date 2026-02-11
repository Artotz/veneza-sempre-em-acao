import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { APPOINTMENT_SELECT, mapAppointment } from "../lib/supabase";
import { uploadApontamentoImage } from "../services/storageUploads";
import {
  getPhotoBlob,
  listPendingPhotos,
  markUploaded,
  removePhotoBlob,
  rebindOfflinePhotos,
} from "../storage/offlinePhotos";
import {
  getPendingAppointment,
  listPendingActions,
  rebindPendingActions,
  removePendingAction,
  removePendingAppointment,
} from "../storage/offlineSchedule";

const REMOVE_BLOB_AFTER_UPLOAD = false;

type SyncAppointmentParams = {
  appointmentId: string;
  userEmail: string;
  consultantId?: string | null;
};

type SyncAppointmentResult = {
  appointmentId: string;
  created: boolean;
  photosUploaded: number;
  actionsApplied: number;
};

export const syncAppointment = async (
  params: SyncAppointmentParams
): Promise<SyncAppointmentResult> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Sem internet.");
  }

  const supabase = createSupabaseBrowserClient();
  let appointmentId = params.appointmentId;
  let created = false;

  const pendingAppointment = await getPendingAppointment(appointmentId);
  if (pendingAppointment) {
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({
        company_id: pendingAppointment.companyId,
        starts_at: pendingAppointment.startAt,
        ends_at: pendingAppointment.endAt,
        consultant_id: pendingAppointment.consultantId ?? null,
        consultant_name: pendingAppointment.consultant ?? params.userEmail,
        created_by: pendingAppointment.createdBy ?? params.userEmail,
        status: pendingAppointment.status ?? "scheduled",
        address_snapshot: pendingAppointment.addressSnapshot ?? null,
      })
      .select(APPOINTMENT_SELECT)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const mapped = data ? mapAppointment(data) : null;
    if (!mapped) {
      throw new Error("Nao foi possivel criar o apontamento.");
    }

    const newId = mapped.id;
    await rebindPendingActions(appointmentId, newId);
    await rebindOfflinePhotos(appointmentId, newId);
    await removePendingAppointment(appointmentId);

    appointmentId = newId;
    created = true;
  }

  const pendingActions = (await listPendingActions(params.userEmail)).filter(
    (item) => item.appointmentId === appointmentId
  );

  let actionsApplied = 0;
  for (const item of pendingActions) {
    try {
      const { error } = await supabase
        .from("apontamentos")
        .update(item.changes)
        .eq("id", item.appointmentId)
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      await removePendingAction(item.id);
      actionsApplied += 1;
    } catch (error) {
      console.warn("Falha ao sincronizar apontamento", error);
    }
  }

  const pendingPhotos = (await listPendingPhotos()).filter(
    (item) =>
      item.entityRef === appointmentId || item.apontamentoId === appointmentId
  );

  let photosUploaded = 0;
  for (const item of pendingPhotos) {
    const blob = await getPhotoBlob(item.id);
    if (!blob) {
      console.warn("Blob nao encontrado para foto pendente", item.id);
      continue;
    }

    const consultantId = item.consultantId ?? params.consultantId;
    const kind = item.kind as "checkin" | "checkout" | "absence" | undefined;

    if (!consultantId || !kind) {
      console.warn("Foto pendente sem metadados suficientes", item);
      continue;
    }

    try {
      const upload = await uploadApontamentoImage({
        apontamentoId: appointmentId,
        consultantId,
        kind,
        blob,
        mimeType: item.mime || blob.type || "image/jpeg",
      });

      const { error: insertError } = await supabase
        .from("apontamento_media")
        .insert({
          apontamento_id: appointmentId,
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

      photosUploaded += 1;
    } catch (error) {
      console.warn("Falha ao sincronizar foto", error);
    }
  }

  return { appointmentId, created, photosUploaded, actionsApplied };
};
