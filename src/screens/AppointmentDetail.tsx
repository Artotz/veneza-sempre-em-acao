import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { AppShell } from "../components/AppShell";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateShort, formatTime, isSameDay } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  sortByStart,
} from "../lib/schedule";
import { useGeolocation } from "../hooks/useGeolocation";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useSchedule } from "../state/useSchedule";
import { useAuth } from "../contexts/useAuth";
import {
  APPOINTMENT_SELECT,
  COMPANY_SELECT,
  absenceReasonLabels,
  mapAppointment,
  mapCompany,
} from "../lib/supabase";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { Appointment, Company } from "../lib/types";
import type { CapturePhotoResult } from "../services/camera";
import { uploadApontamentoImage } from "../services/storageUploads";
import type { OfflinePhotoMeta } from "../storage/offlinePhotos";
import {
  getPhotoBlob,
  listPendingPhotos,
  saveOfflinePhoto,
} from "../storage/offlinePhotos";
import {
  listPendingActions,
  removePendingAction,
  savePendingAction,
} from "../storage/offlineSchedule";
import { syncAppointment } from "../sync/appointmentSync";
import { t } from "../i18n";

const absenceOptions = [
  {
    label: t("ui.cliente_solicitou_remarcacao"),
    value: "client_requested_reschedule",
  },
  { label: t("ui.endereco_fechado"), value: "address_closed" },
  { label: t("ui.equipamento_indisponivel"), value: "equipment_unavailable" },
  { label: t("ui.outro"), value: "other" },
];

const oportunidadeOptions = [
  { label: t("ui.preventiva"), value: "preventiva" },
  { label: t("ui.garantia_basica"), value: "garantia_basica" },
  { label: t("ui.garantia_estendida"), value: "garantia_estendida" },
  { label: t("ui.reforma_de_componentes"), value: "reforma_componentes" },
  { label: t("ui.lamina"), value: "lamina" },
  { label: t("ui.dentes"), value: "dentes" },
  { label: t("ui.rodante"), value: "rodante" },
  { label: t("ui.disponibilidade"), value: "disponibilidade" },
  { label: t("ui.reconexao"), value: "reconexao" },
  { label: t("ui.transferencia_aor"), value: "transferencia_aor" },
  { label: t("ui.pops"), value: "pops" },
  { label: t("ui.outros"), value: "outros" },
];

const oportunidadeLabels = Object.fromEntries(
  oportunidadeOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

type MediaKind = "checkin" | "checkout" | "absence";

type ApontamentoMediaRow = {
  id?: string;
  bucket: string;
  path: string;
  kind: MediaKind;
  mime_type?: string | null;
  bytes?: number | null;
  created_at?: string | null;
};

type AppointmentMediaItem = {
  id?: string;
  bucket: string;
  path: string;
  kind: MediaKind;
  mimeType: string | null;
  bytes: number;
  createdAt?: string | null;
  signedUrl: string | null;
};

type OfflinePhotoPreview = OfflinePhotoMeta & {
  previewUrl: string | null;
};

const mediaKindLabels: Record<MediaKind, string> = {
  checkin: t("ui.check_in"),
  checkout: t("ui.check_out"),
  absence: t("ui.ausencia"),
};

const markerIconOptions: L.IconOptions = {
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
};

const defaultMarkerIcon = L.icon(markerIconOptions);

const checkInMarkerIcon = L.icon({
  ...markerIconOptions,
  className: "leaflet-marker-icon--checkin",
});

const checkOutMarkerIcon = L.icon({
  ...markerIconOptions,
  className: "leaflet-marker-icon--checkout",
});

type MapPoint = {
  id: string;
  label: string;
  position: [number, number];
  kind: "company" | "checkin" | "checkout";
  timestampLabel: string;
};

const mapMarkerIcons: Record<MapPoint["kind"], L.Icon> = {
  company: defaultMarkerIcon,
  checkin: checkInMarkerIcon,
  checkout: checkOutMarkerIcon,
};

const generatePhotoId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const MapFitBounds = ({ points }: { points: MapPoint[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((point) => point.position));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
  }, [map, points]);

  return null;
};

const formatMapDateTimeLabel = (value?: string | null) => {
  if (!value) return t("ui.data_hora_nao_registrada");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t("ui.data_hora_invalida");
  return `${formatDateShort(parsed)} - ${formatTime(parsed)}`;
};

export default function AppointmentDetail() {
  const { id } = useParams();
  const { state, selectors, actions } = useSchedule();
  const { session, user, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const appointmentFromState = id ? selectors.getAppointment(id) : undefined;
  const companyFromState = appointmentFromState
    ? selectors.getCompany(appointmentFromState.companyId)
    : undefined;

  const [appointment, setAppointment] = useState<Appointment | null>(
    appointmentFromState ?? null,
  );
  const [company, setCompany] = useState<Company | null>(
    companyFromState ?? null,
  );
  const [loading, setLoading] = useState(!appointmentFromState);
  const [error, setError] = useState<string | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNote, setAbsenceNote] = useState("");
  const [geoIntent, setGeoIntent] = useState<"check_in" | "check_out" | null>(
    null,
  );
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [cameraIntent, setCameraIntent] = useState<
    "checkin" | "checkout" | null
  >(null);
  const [mediaItems, setMediaItems] = useState<AppointmentMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<OfflinePhotoPreview[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const pendingPreviewUrlsRef = useRef<Record<string, string>>({});
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAbsenceOpen, setIsAbsenceOpen] = useState(false);
  const [checkoutOpportunities, setCheckoutOpportunities] = useState<string[]>(
    [],
  );
  const [pendingCheckoutOpportunities, setPendingCheckoutOpportunities] =
    useState<string[] | null>(null);
  const [checkoutObservation, setCheckoutObservation] = useState("");
  const [pendingCheckoutObservation, setPendingCheckoutObservation] = useState<
    string | null
  >(null);
  const [showCheckInMarker, setShowCheckInMarker] = useState(true);
  const [showCheckOutMarker, setShowCheckOutMarker] = useState(true);

  const geo = useGeolocation();
  useLockBodyScroll(
    isActionsOpen || isCheckoutOpen || isAbsenceOpen || cameraIntent !== null,
  );
  const isCameraOpen = cameraIntent !== null;

  useEffect(() => {
    if (appointmentFromState) {
      setAppointment(appointmentFromState);
      setAbsenceReason(appointmentFromState.absenceReason ?? "");
      setAbsenceNote(appointmentFromState.absenceNote ?? "");
    }
    if (companyFromState) {
      setCompany(companyFromState);
    }
  }, [appointmentFromState, companyFromState]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    if (authLoading) return;
    if (appointmentFromState) {
      setError(null);
      setAppointment(appointmentFromState);
      if (companyFromState) {
        setCompany(companyFromState);
      }
      setLoading(false);
      return;
    }
    if (state.loading) {
      return;
    }
    if (!isOnline) {
      setError(null);
      setLoading(false);
      return;
    }
    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError(t("ui.usuario_nao_autenticado"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("apontamentos")
      .select(`${APPOINTMENT_SELECT}, companies(${COMPANY_SELECT})`)
      .eq("id", id)
      .eq("consultant_name", userEmail)
      .maybeSingle();

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError(t("ui.agendamento_nao_encontrado_2"));
      setLoading(false);
      return;
    }

    const mappedAppointment = mapAppointment(data);
    const rawCompany = Array.isArray(data.companies)
      ? data.companies[0]
      : data.companies;
    const mappedCompany = rawCompany ? mapCompany(rawCompany) : null;

    setAppointment(mappedAppointment);
    setCompany(mappedCompany);
    setAbsenceReason(mappedAppointment.absenceReason ?? "");
    setAbsenceNote(mappedAppointment.absenceNote ?? "");
    setLoading(false);
  }, [
    appointmentFromState,
    authLoading,
    companyFromState,
    id,
    isOnline,
    state.loading,
    supabase,
    user?.email,
  ]);

  const loadMedia = useCallback(async () => {
    if (!id) return;
    if (!isOnline) {
      setMediaLoading(false);
      setMediaError(null);
      return;
    }
    setMediaLoading(true);
    setMediaError(null);

    const { data, error: requestError } = await supabase
      .from("apontamento_media")
      .select("id, bucket, path, kind, mime_type, bytes, created_at")
      .eq("apontamento_id", id)
      .order("created_at", { ascending: true });

    if (requestError) {
      setMediaError(requestError.message);
      setMediaLoading(false);
      return;
    }

    const rows = (data ?? []) as ApontamentoMediaRow[];
    const signedItems = await Promise.all(
      rows.map(async (item) => {
        const { data: signedData, error: signedError } = await supabase.storage
          .from(item.bucket)
          .createSignedUrl(item.path, 60);

        if (signedError) {
          console.warn("Falha ao gerar signed url", signedError);
        }

        return {
          id: item.id,
          bucket: item.bucket,
          path: item.path,
          kind: item.kind,
          mimeType: item.mime_type ?? null,
          bytes: item.bytes ?? 0,
          createdAt: item.created_at ?? null,
          signedUrl: signedError ? null : (signedData?.signedUrl ?? null),
        } as AppointmentMediaItem;
      }),
    );

    setMediaItems(signedItems);
    setMediaLoading(false);
  }, [id, isOnline, supabase]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateStatus = () => setIsOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pendingPreviewUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      pendingPreviewUrlsRef.current = {};
    };
  }, []);

  const dayAppointments = useMemo(() => {
    if (!appointment) return [];
    const target = new Date(appointment.startAt);
    return state.appointments
      .filter((item) => isSameDay(new Date(item.startAt), target))
      .sort(sortByStart);
  }, [appointment, state.appointments]);

  const loadPendingPhotos = useCallback(async () => {
    if (!appointment) {
      Object.values(pendingPreviewUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      pendingPreviewUrlsRef.current = {};
      setPendingPhotos([]);
      return;
    }
    setPendingLoading(true);
    setPendingError(null);
    try {
      const allPending = await listPendingPhotos();
      const scoped = allPending.filter(
        (item) =>
          item.entityRef === appointment.id ||
          item.apontamentoId === appointment.id,
      );

      Object.values(pendingPreviewUrlsRef.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
      pendingPreviewUrlsRef.current = {};

      const withPreview = await Promise.all(
        scoped.map(async (item) => {
          const blob = await getPhotoBlob(item.id);
          let previewUrl: string | null = null;
          if (blob) {
            previewUrl = URL.createObjectURL(blob);
            pendingPreviewUrlsRef.current[item.id] = previewUrl;
          }
          return { ...item, previewUrl };
        }),
      );

      setPendingPhotos(withPreview);
    } catch (pendingLoadError) {
      setPendingPhotos([]);
      setPendingError(
        pendingLoadError instanceof Error
          ? pendingLoadError.message
          : t("ui.nao_foi_possivel_carregar_as_fotos_pendentes"),
      );
    } finally {
      setPendingLoading(false);
    }
  }, [appointment]);

  useEffect(() => {
    void loadPendingPhotos();
  }, [loadPendingPhotos]);

  const loadPendingActions = useCallback(async () => {
    if (!appointment || !user?.email) {
      setPendingActionCount(0);
      return;
    }

    try {
      const pending = await listPendingActions(user.email);
      const scoped = pending.filter(
        (item) => item.appointmentId === appointment.id,
      );
      setPendingActionCount(scoped.length);
    } catch (error) {
      console.warn("Falha ao carregar pendencias de apontamento", error);
      setPendingActionCount(0);
    }
  }, [appointment, user?.email]);

  useEffect(() => {
    void loadPendingActions();
  }, [loadPendingActions]);

  const storeOfflinePhoto = useCallback(
    async (kind: MediaKind, shot: CapturePhotoResult) => {
      if (!appointment) {
        throw new Error(t("ui.agendamento_nao_encontrado_2"));
      }
      const consultantId = session?.user?.id;
      if (!consultantId) {
        throw new Error(t("ui.usuario_nao_autenticado"));
      }

      const photoId = generatePhotoId();
      await saveOfflinePhoto(photoId, shot.blob, {
        entityRef: appointment.id,
        apontamentoId: appointment.id,
        kind,
        consultantId,
      });

      await loadPendingPhotos();
      return photoId;
    },
    [appointment, loadPendingPhotos, session?.user?.id],
  );

  const buildCheckInRemoteChanges = useCallback(
    (payload: {
      at: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
    }) => {
      const changes: Record<string, unknown> = {
        check_in_at: payload.at,
        status: "in_progress",
      };
      if (payload.lat != null && payload.lng != null) {
        changes.check_in_lat = payload.lat;
        changes.check_in_lng = payload.lng;
        if (payload.accuracy != null) {
          changes.check_in_accuracy_m = payload.accuracy;
        }
      }
      return changes;
    },
    [],
  );

  const buildCheckOutRemoteChanges = useCallback(
    (payload: {
      at: string;
      lat?: number | null;
      lng?: number | null;
      accuracy?: number | null;
      oportunidades: string[];
      notes?: string | null;
    }) => {
      const changes: Record<string, unknown> = {
        check_out_at: payload.at,
        status: "done",
        oportunidades: payload.oportunidades,
        notes: payload.notes ?? null,
      };
      if (payload.lat != null && payload.lng != null) {
        changes.check_out_lat = payload.lat;
        changes.check_out_lng = payload.lng;
        if (payload.accuracy != null) {
          changes.check_out_accuracy_m = payload.accuracy;
        }
      }
      return changes;
    },
    [],
  );

  const buildAbsenceRemoteChanges = useCallback(
    (payload: { reason: string; note?: string }) => ({
      absence_reason: payload.reason,
      absence_note: payload.note ?? null,
      status: "absent",
    }),
    [],
  );

  const updateAppointmentRemote = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!appointment) {
        throw new Error(t("ui.agendamento_nao_encontrado_2"));
      }
      const { error: updateError } = await supabase
        .from("apontamentos")
        .update(changes)
        .eq("id", appointment.id)
        .select("id")
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }
    },
    [appointment, supabase],
  );

  const uploadPhotoRemote = useCallback(
    async (kind: MediaKind, shot: CapturePhotoResult) => {
      if (!appointment) {
        throw new Error(t("ui.agendamento_nao_encontrado_2"));
      }
      const consultantId = session?.user?.id;
      if (!consultantId) {
        throw new Error(t("ui.usuario_nao_autenticado"));
      }

      const upload = await uploadApontamentoImage({
        apontamentoId: appointment.id,
        consultantId,
        kind,
        blob: shot.blob,
        mimeType: shot.mimeType,
      });

      const { error: insertError } = await supabase
        .from("apontamento_media")
        .insert({
          apontamento_id: appointment.id,
          bucket: upload.bucket,
          path: upload.path,
          kind,
          mime_type: shot.mimeType,
          bytes: upload.bytes,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }
    },
    [appointment, session?.user?.id, supabase],
  );

  const queuePendingActionOnly = useCallback(
    async (params: {
      actionType: "checkIn" | "checkOut" | "absence";
      changes: Record<string, unknown>;
    }) => {
      if (!appointment) {
        throw new Error(t("ui.agendamento_nao_encontrado_2"));
      }
      const userEmail = user?.email?.trim();
      if (!userEmail) {
        throw new Error(t("ui.usuario_nao_autenticado"));
      }
      await savePendingAction({
        userEmail,
        appointmentId: appointment.id,
        actionType: params.actionType,
        changes: params.changes,
      });
      actions.setPendingSync(appointment.id, true);
      await loadPendingActions();
    },
    [actions, appointment, loadPendingActions, user?.email],
  );

  const queuePendingActionWithPhoto = useCallback(
    async (params: {
      actionType: "checkIn" | "checkOut" | "absence";
      changes: Record<string, unknown>;
      kind: MediaKind;
      shot: CapturePhotoResult;
    }) => {
      if (!appointment) {
        throw new Error(t("ui.agendamento_nao_encontrado_2"));
      }
      const userEmail = user?.email?.trim();
      if (!userEmail) {
        throw new Error(t("ui.usuario_nao_autenticado"));
      }
      const pendingAction = await savePendingAction({
        userEmail,
        appointmentId: appointment.id,
        actionType: params.actionType,
        changes: params.changes,
      });

      try {
        const consultantId = session?.user?.id;
        if (!consultantId) {
          throw new Error(t("ui.usuario_nao_autenticado"));
        }
        const photoId = generatePhotoId();
        await saveOfflinePhoto(photoId, params.shot.blob, {
          entityRef: appointment.id,
          apontamentoId: appointment.id,
          kind: params.kind,
          consultantId,
        });
      } catch (error) {
        await removePendingAction(pendingAction.id);
        throw error;
      }

      actions.setPendingSync(appointment.id, true);
      await loadPendingActions();
      await loadPendingPhotos();
    },
    [
      actions,
      appointment,
      loadPendingActions,
      loadPendingPhotos,
      session?.user?.id,
      user?.email,
    ],
  );

  const queuePendingPhotoOnly = useCallback(
    async (params: { kind: MediaKind; shot: CapturePhotoResult }) => {
      await storeOfflinePhoto(params.kind, params.shot);
      if (appointment) {
        actions.setPendingSync(appointment.id, true);
      }
    },
    [actions, appointment, storeOfflinePhoto],
  );

  const syncCheckIn = useCallback(
    async (params: {
      shot: CapturePhotoResult;
      at: string;
      position: { lat: number; lng: number; accuracy: number } | null;
    }) => {
      try {
        const changes = buildCheckInRemoteChanges({
          at: params.at,
          lat: params.position?.lat ?? null,
          lng: params.position?.lng ?? null,
          accuracy: params.position?.accuracy ?? null,
        });

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queuePendingActionWithPhoto({
            actionType: "checkIn",
            changes,
            kind: "checkin",
            shot: params.shot,
          });
          return;
        }

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          await queuePendingActionWithPhoto({
            actionType: "checkIn",
            changes,
            kind: "checkin",
            shot: params.shot,
          });
          return;
        }

        try {
          await uploadPhotoRemote("checkin", params.shot);
          await loadMedia();
        } catch (error) {
          await queuePendingPhotoOnly({ kind: "checkin", shot: params.shot });
        }
      } catch (error) {
        setSyncStatus(
          error instanceof Error
            ? error.message
            : t("ui.nao_foi_possivel_sincronizar_o_check_in"),
        );
      }
    },
    [
      buildCheckInRemoteChanges,
      loadMedia,
      queuePendingActionWithPhoto,
      queuePendingPhotoOnly,
      updateAppointmentRemote,
      uploadPhotoRemote,
    ],
  );

  const syncCheckOut = useCallback(
    async (params: {
      shot: CapturePhotoResult;
      at: string;
      position: { lat: number; lng: number; accuracy: number } | null;
      oportunidades: string[];
      notes?: string | null;
    }) => {
      try {
        const changes = buildCheckOutRemoteChanges({
          at: params.at,
          lat: params.position?.lat ?? null,
          lng: params.position?.lng ?? null,
          accuracy: params.position?.accuracy ?? null,
          oportunidades: params.oportunidades,
          notes: params.notes ?? null,
        });

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queuePendingActionWithPhoto({
            actionType: "checkOut",
            changes,
            kind: "checkout",
            shot: params.shot,
          });
          return;
        }

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          await queuePendingActionWithPhoto({
            actionType: "checkOut",
            changes,
            kind: "checkout",
            shot: params.shot,
          });
          return;
        }

        try {
          await uploadPhotoRemote("checkout", params.shot);
          await loadMedia();
        } catch (error) {
          await queuePendingPhotoOnly({ kind: "checkout", shot: params.shot });
        }
      } catch (error) {
        setSyncStatus(
          error instanceof Error
            ? error.message
            : t("ui.nao_foi_possivel_sincronizar_o_check_out"),
        );
      }
    },
    [
      buildCheckOutRemoteChanges,
      loadMedia,
      queuePendingActionWithPhoto,
      queuePendingPhotoOnly,
      updateAppointmentRemote,
      uploadPhotoRemote,
    ],
  );

  const syncAbsence = useCallback(
    async (params: { reason: string; note?: string }) => {
      try {
        const changes = buildAbsenceRemoteChanges({
          reason: params.reason,
          note: params.note,
        });

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queuePendingActionOnly({ actionType: "absence", changes });
          return;
        }

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          await queuePendingActionOnly({ actionType: "absence", changes });
        }
      } catch (error) {
        setSyncStatus(
          error instanceof Error
            ? error.message
            : t("ui.nao_foi_possivel_sincronizar_a_ausencia"),
        );
      }
    },
    [
      buildAbsenceRemoteChanges,
      queuePendingActionOnly,
      updateAppointmentRemote,
    ],
  );

  const mapPoints = useMemo(() => {
    if (!appointment) return [];
    const points: MapPoint[] = [];
    const pushPoint = (
      id: string,
      label: string,
      lat?: number | null,
      lng?: number | null,
      kind: MapPoint["kind"] = "company",
      occurredAt?: string | null,
    ) => {
      if (lat == null || lng == null) return;
      const latNumber = Number(lat);
      const lngNumber = Number(lng);
      if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) return;
      points.push({
        id,
        label,
        position: [latNumber, lngNumber],
        kind,
        timestampLabel: formatMapDateTimeLabel(occurredAt),
      });
    };

    if (company) {
      pushPoint(
        "company",
        company.name ?? t("ui.empresa"),
        company.lat,
        company.lng,
        "company",
        appointment.startAt,
      );
    }
    pushPoint(
      "checkin",
      t("ui.check_in"),
      appointment.checkInLat,
      appointment.checkInLng,
      "checkin",
      appointment.checkInAt,
    );
    pushPoint(
      "checkout",
      t("ui.check_out"),
      appointment.checkOutLat,
      appointment.checkOutLng,
      "checkout",
      appointment.checkOutAt,
    );

    return points;
  }, [appointment, company]);

  const filteredMapPoints = useMemo(
    () =>
      mapPoints.filter((point) => {
        if (point.kind === "checkin") return showCheckInMarker;
        if (point.kind === "checkout") return showCheckOutMarker;
        return true;
      }),
    [mapPoints, showCheckInMarker, showCheckOutMarker],
  );

  if (!appointment && loading) {
    return (
      <AppShell
        title={t("ui.agendamento")}
        subtitle={t("ui.carregando_detalhes")}
      >
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (!appointment) {
    return (
      <AppShell
        title={t("ui.agendamento")}
        subtitle={t("ui.detalhe_do_atendimento")}
      >
        <EmptyState
          title={t("ui.agendamento_nao_encontrado")}
          description={
            error ?? t("ui.volte_para_o_dia_e_selecione_outro_horario")
          }
        />
        {/* <Link
          to="/cronograma/dia"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para o dia
        </Link> */}
      </AppShell>
    );
  }

  const status = getAppointmentStatus(appointment);
  const blocked = isBlocked(appointment, dayAppointments);
  const busy = state.busyIds.includes(appointment.id);
  const dayLabel = formatDateShort(new Date(appointment.startAt));
  const isTodayAppointment = isSameDay(
    new Date(appointment.startAt),
    new Date(),
  );
  const canCheckIn =
    !blocked &&
    isTodayAppointment &&
    (appointment.status ?? "scheduled") === "scheduled";
  const canCheckOut =
    !blocked &&
    isTodayAppointment &&
    (appointment.status ?? "scheduled") === "in_progress";
  const canAbsence =
    !blocked &&
    (appointment.status ?? "scheduled") !== "done" &&
    (appointment.status ?? "scheduled") !== "absent";
  const isCheckInCapturing = geo.isCapturing && geoIntent === "check_in";
  const isCheckOutCapturing = geo.isCapturing && geoIntent === "check_out";
  const isPhotoBusy = Boolean(photoStatus) || isCameraOpen;
  const isCheckoutBusy = isPhotoBusy || geo.isCapturing;

  const formatCoordinates = (lat?: number | null, lng?: number | null) => {
    if (lat == null || lng == null) return t("ui.nao_registrado");
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };

  const formatAccuracy = (accuracy?: number | null) => {
    if (accuracy == null) return t("ui.nao_registrado");
    return `+/- ${Math.round(accuracy)} m`;
  };

  const formatGeoTime = (value?: string | null) =>
    value ? formatTime(new Date(value)) : t("ui.nao_registrado");

  const isGeoError = (value: unknown) => {
    const code = (value as { code?: unknown })?.code;
    return (
      typeof code === "string" &&
      [
        "PERMISSION_DENIED",
        "POSITION_UNAVAILABLE",
        "TIMEOUT",
        "UNSUPPORTED",
        "UNKNOWN",
      ].includes(code)
    );
  };

  const handleCheckIn = () => {
    if (!canCheckIn || busy || geo.isCapturing || isPhotoBusy) return;
    setError(null);
    setCameraIntent("checkin");
  };

  const handleCheckOut = () => {
    if (!canCheckOut || busy || geo.isCapturing || isPhotoBusy) return;
    setError(null);
    setCheckoutOpportunities([]);
    setPendingCheckoutOpportunities(null);
    setCheckoutObservation(appointment?.notes ?? "");
    setPendingCheckoutObservation(null);
    setIsCheckoutOpen(true);
    setIsActionsOpen(false);
  };

  const handleCloseCheckout = () => {
    if (isCheckoutBusy) return;
    setIsCheckoutOpen(false);
    setCheckoutOpportunities([]);
    setPendingCheckoutOpportunities(null);
    setCheckoutObservation("");
    setPendingCheckoutObservation(null);
    geo.resetError();
    setGeoIntent(null);
  };

  const toggleCheckoutOpportunity = (value: string) => {
    setCheckoutOpportunities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const handleConfirmCheckout = () => {
    if (!canCheckOut || busy || geo.isCapturing || isPhotoBusy) return;
    setError(null);
    setPendingCheckoutOpportunities([...checkoutOpportunities]);
    const normalizedObservation = checkoutObservation.trim();
    setPendingCheckoutObservation(
      normalizedObservation.length ? normalizedObservation : null,
    );
    setCameraIntent("checkout");
  };

  const handleSyncAppointment = async () => {
    if (isSyncing || !appointment) return;
    if (!isOnline) {
      setSyncStatus(t("ui.sem_internet"));
      return;
    }
    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setSyncStatus(t("ui.usuario_nao_autenticado"));
      return;
    }
    setSyncStatus("Sincronizando apontamento...");
    setIsSyncing(true);
    try {
      const result = await syncAppointment({
        appointmentId: appointment.id,
        userEmail,
        consultantId: session?.user?.id ?? null,
      });
      if (result.appointmentId !== appointment.id) {
        navigate(`/apontamentos/${result.appointmentId}`, { replace: true });
      }
      await actions.refresh();
      await loadMedia();
      await loadPendingPhotos();
      await loadPendingActions();
      setSyncStatus("Sincronizacao concluida.");
    } catch (syncError) {
      setSyncStatus(
        syncError instanceof Error
          ? syncError.message
          : t("ui.nao_foi_possivel_sincronizar_o_apontamento"),
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const performCheckIn = async (shot: CapturePhotoResult) => {
    if (!canCheckIn || busy || geo.isCapturing) return;
    setError(null);
    setSyncStatus(null);
    geo.resetError();
    setGeoIntent("check_in");
    try {
      let position: { lat: number; lng: number; accuracy: number } | null =
        null;
      try {
        position = await geo.capture();
      } catch (geoError) {
        if (isGeoError(geoError)) {
          geo.resetError();
          setPhotoStatus(
            "Localizacao indisponivel, salvando sem localizacao...",
          );
        } else {
          throw geoError;
        }
      }
      const now = new Date().toISOString();
      await actions.checkIn(appointment.id, {
        at: now,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        accuracy: position?.accuracy ?? null,
      });
      setGeoIntent(null);
      setPhotoStatus(null);
      void syncCheckIn({ shot, at: now, position });
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("ui.nao_foi_possivel_registrar_o_check_in"),
      );
      setGeoIntent(null);
    } finally {
      setPhotoStatus(null);
    }
  };

  const performCheckOut = async (shot: CapturePhotoResult) => {
    if (!canCheckOut || busy || geo.isCapturing) return;
    setError(null);
    setSyncStatus(null);
    geo.resetError();
    setGeoIntent("check_out");
    const oportunidades = pendingCheckoutOpportunities ?? checkoutOpportunities;
    const observationSource = pendingCheckoutObservation ?? checkoutObservation;
    const normalizedObservation = observationSource.trim();
    const notes = normalizedObservation.length ? normalizedObservation : null;
    try {
      let position: { lat: number; lng: number; accuracy: number } | null =
        null;
      try {
        position = await geo.capture();
      } catch (geoError) {
        if (isGeoError(geoError)) {
          geo.resetError();
          setPhotoStatus(
            "Localizacao indisponivel, salvando sem localizacao...",
          );
        } else {
          throw geoError;
        }
      }
      const now = new Date().toISOString();
      await actions.checkOut(appointment.id, {
        at: now,
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        accuracy: position?.accuracy ?? null,
        oportunidades: oportunidades ?? [],
        notes,
      });
      setGeoIntent(null);
      setIsCheckoutOpen(false);
      setCheckoutOpportunities([]);
      setPendingCheckoutOpportunities(null);
      setCheckoutObservation("");
      setPendingCheckoutObservation(null);
      setPhotoStatus(null);
      void syncCheckOut({
        shot,
        at: now,
        position,
        oportunidades: oportunidades ?? [],
        notes,
      });
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("ui.nao_foi_possivel_registrar_o_check_out"),
      );
      setGeoIntent(null);
    } finally {
      setPhotoStatus(null);
    }
  };

  const handleCameraConfirm = async (shot: CapturePhotoResult) => {
    const intent = cameraIntent;
    setCameraIntent(null);
    if (!intent) return;

    if (intent === "checkin") {
      await performCheckIn(shot);
      return;
    }

    if (intent === "checkout") {
      await performCheckOut(shot);
    }
  };

  const handleAbsence = async () => {
    if (!canAbsence || busy || isPhotoBusy) return;
    setError(null);
    setSyncStatus(null);
    const reason = absenceReason.trim() || "other";
    try {
      await actions.justifyAbsence(appointment.id, reason, absenceNote.trim());
      setIsAbsenceOpen(false);
      void syncAbsence({ reason, note: absenceNote.trim() });
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("ui.nao_foi_possivel_registrar_a_ausencia"),
      );
    } finally {
      setPhotoStatus(null);
    }
  };

  const handleRetryGeo = async () => {
    if (geoIntent === "check_in") {
      await handleCheckIn();
      return;
    }
    if (geoIntent === "check_out") {
      await handleCheckOut();
    }
  };

  const handleCancelGeo = () => {
    geo.resetError();
    setGeoIntent(null);
  };

  const handleRetryCheckoutGeo = () => {
    if (!canCheckOut || busy || isCheckoutBusy) return;
    geo.resetError();
    setCameraIntent("checkout");
  };

  const handleOpenActions = () => {
    setIsActionsOpen(true);
  };

  const handleCloseActions = () => {
    setIsActionsOpen(false);
  };

  const handleOpenAbsence = () => {
    if (!canAbsence || busy || isPhotoBusy) return;
    setIsAbsenceOpen(true);
    setIsActionsOpen(false);
  };

  const handleCloseAbsence = () => {
    if (isPhotoBusy) return;
    setIsAbsenceOpen(false);
  };

  const snapshotLabel = appointment.addressSnapshot ?? null;

  const absenceLabel =
    absenceReasonLabels[appointment.absenceReason ?? ""] ??
    appointment.absenceReason ??
    t("ui.nenhuma");

  const oportunidades = appointment.oportunidades ?? [];
  const showOportunidades = Boolean(
    appointment.checkOutAt || appointment.status === "done",
  );
  const checkoutNotes = appointment.notes?.trim() ?? "";
  const showCheckoutNotes = checkoutNotes.length > 0;
  const hasMapPoints = mapPoints.length > 0;
  const hasFilteredMapPoints = filteredMapPoints.length > 0;
  const companyDisplayName =
    company?.name ?? appointment.companyName ?? t("ui.empresa");
  const pendingItemBase = pendingPhotos.length + pendingActionCount;
  const pendingItemCount =
    pendingItemBase +
    (appointment.pendingSync && pendingItemBase === 0 ? 1 : 0);

  const cameraTitle =
    cameraIntent === "checkin"
      ? t("ui.foto_do_check_in")
      : cameraIntent === "checkout"
        ? t("ui.foto_do_check_out")
        : t("ui.capturar_foto");

  return (
    <AppShell
      title={t("ui.detalhe_do_agendamento")}
      subtitle={getAppointmentTitle(appointment)}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* <Link
            to="/cronograma/dia"
            className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
          >
            Voltar para o dia
          </Link> */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                isOnline
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {isOnline ? t("ui.online") : t("ui.offline")}
            </span>
            <button
              type="button"
              onClick={handleSyncAppointment}
              disabled={isSyncing || pendingItemCount === 0}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                isSyncing || pendingItemCount === 0
                  ? "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  : "bg-accent text-white"
              }`}
            >
              {isSyncing
                ? t("ui.sincronizando_apontamento")
                : t("ui.sincronizar_apontamento_pendencias_count", {
                    count: pendingItemCount,
                  })}
            </button>
          </div>
        </div>
        {syncStatus ? (
          <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
            {syncStatus}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground-soft">
                {dayLabel} - {formatAppointmentWindow(appointment)}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {companyDisplayName}
              </h2>
              {company?.document ? (
                <p className="mt-1 text-sm text-foreground-muted">
                  {company.document}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {appointment.pendingSync ? (
                <span className="rounded-full bg-warning/15 px-2 py-1 text-[10px] font-semibold text-warning">
                  {t("ui.pendente")}
                </span>
              ) : null}
              <StatusBadge status={status} />
            </div>
          </div>

          <div className="mt-3 space-y-2 text-sm text-foreground-muted">
            <div className="flex items-center justify-between">
              <span>{t("ui.consultor")}</span>
              <span className="font-semibold text-foreground">
                {appointment.consultant || t("ui.nao_informado")}
              </span>
            </div>
            {appointment.createdBy ? (
              <div className="flex items-center justify-between">
                <span>{t("ui.criado_por")}</span>
                <span className="font-semibold text-foreground">
                  {appointment.createdBy}
                </span>
              </div>
            ) : null}
            {snapshotLabel ? (
              <div className="flex items-center justify-between">
                <span>{t("ui.endereco_snapshot")}</span>
                <span className="font-semibold text-foreground">
                  {snapshotLabel}
                </span>
              </div>
            ) : null}
          </div>

          {blocked ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              {t(
                "ui.este_agendamento_esta_bloqueado_conclua_o_pendente_anterior_no_mesmo_dia_para_liberar_as_acoes",
              )}
            </div>
          ) : null}
          {!isTodayAppointment ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground-soft">
              {t(
                "ui.check_in_e_check_out_so_podem_ser_feitos_no_dia_do_apontamento",
              )}
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title={t("ui.linha_do_tempo")} />
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">{t("ui.check_in")}</span>
              <span className="font-semibold text-foreground">
                {appointment.checkInAt
                  ? formatTime(new Date(appointment.checkInAt))
                  : t("ui.nao_realizado")}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">{t("ui.check_out")}</span>
              <span className="font-semibold text-foreground">
                {appointment.checkOutAt
                  ? formatTime(new Date(appointment.checkOutAt))
                  : t("ui.nao_realizado")}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">{t("ui.ausencia")}</span>
              <span className="font-semibold text-foreground">
                {absenceLabel}
              </span>
            </div>
            {appointment.absenceNote ? (
              <div className="rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground-muted">
                {appointment.absenceNote}
              </div>
            ) : null}
          </div>
        </section>

        {showOportunidades ? (
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader title={t("ui.oportunidades_percebidas")} />
            {oportunidades.length ? (
              <div className="flex flex-wrap gap-2">
                {oportunidades.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-surface-muted px-3 py-1 text-[11px] font-semibold text-foreground"
                  >
                    {oportunidadeLabels[item] ?? item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-foreground-muted">{t("ui.nenhuma")}</p>
            )}
          </section>
        ) : null}

        {showCheckoutNotes ? (
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader title={t("ui.observacao_do_check_out")} />
            <p className="text-sm text-foreground-muted whitespace-pre-wrap">
              {checkoutNotes}
            </p>
          </section>
        ) : null}

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader
            title={t("ui.acoes")}
            // subtitle={t("ui.sincroniza_com_o_supabase")}
          />
          <button
            type="button"
            onClick={handleOpenActions}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground transition hover:border-accent"
          >
            {t("ui.acoes")}
          </button>
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader
            title={t("ui.mapa")}
            subtitle={t("ui.pinos_do_atendimento")}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowCheckInMarker((current) => !current)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
                showCheckInMarker
                  ? "border-success/50 bg-success/10 text-success"
                  : "border-border bg-white text-foreground-soft"
              }`}
            >
              {t("ui.check_in")}
            </button>
            <button
              type="button"
              onClick={() => setShowCheckOutMarker((current) => !current)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition ${
                showCheckOutMarker
                  ? "border-info/50 bg-info/10 text-info"
                  : "border-border bg-white text-foreground-soft"
              }`}
            >
              {t("ui.check_out")}
            </button>
          </div>
          {hasFilteredMapPoints ? (
            <div className="relative z-0 overflow-hidden rounded-2xl border border-border">
              <MapContainer
                center={filteredMapPoints[0].position}
                zoom={13}
                scrollWheelZoom={false}
                zoomAnimation={false}
                fadeAnimation={false}
                className="h-64 w-full"
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapFitBounds points={filteredMapPoints} />
                {filteredMapPoints.map((point) => (
                  <Marker
                    key={point.id}
                    position={point.position}
                    icon={mapMarkerIcons[point.kind]}
                  >
                    <Popup>
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-foreground">
                          {point.label}
                        </p>
                        <p className="text-foreground-muted">
                          {point.timestampLabel}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
              {hasMapPoints
                ? t("ui.nenhum_pino_visivel_com_os_filtros_atuais")
                : t("ui.sem_coordenadas_para_exibir_no_mapa")}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader
            title={t("ui.recursos")}
            subtitle={t("ui.geolocalizacao_registrada")}
          />
          <div className="mt-3 space-y-3 text-xs text-foreground-muted">
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                {t("ui.check_in")}
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{t("ui.geo")}</span>
                  <span className="font-semibold text-foreground">
                    {formatCoordinates(
                      appointment.checkInLat,
                      appointment.checkInLng,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("ui.precisao")}</span>
                  <span className="font-semibold text-foreground">
                    {formatAccuracy(appointment.checkInAccuracyM)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("ui.horario")}</span>
                  <span className="font-semibold text-foreground">
                    {formatGeoTime(appointment.checkInAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                {t("ui.check_out")}
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{t("ui.geo")}</span>
                  <span className="font-semibold text-foreground">
                    {formatCoordinates(
                      appointment.checkOutLat,
                      appointment.checkOutLng,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("ui.precisao")}</span>
                  <span className="font-semibold text-foreground">
                    {formatAccuracy(appointment.checkOutAccuracyM)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("ui.horario")}</span>
                  <span className="font-semibold text-foreground">
                    {formatGeoTime(appointment.checkOutAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader
            title={t("ui.fotos")}
            subtitle={t("ui.registro_visual_do_apontamento")}
          />
          {mediaLoading || pendingLoading ? (
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
              {t("ui.carregando_fotos")}
            </div>
          ) : null}
          {pendingError ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
              {pendingError}
            </div>
          ) : null}
          {mediaError ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
              {mediaError}
            </div>
          ) : null}
          {!mediaLoading &&
          !pendingLoading &&
          mediaItems.length === 0 &&
          pendingPhotos.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
              {t("ui.nenhuma_foto_registrada_ainda")}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pendingPhotos.map((item) => {
              const kindLabel =
                (item.kind &&
                  (mediaKindLabels as Record<string, string>)[item.kind]) ||
                t("ui.foto");
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-border bg-white"
                >
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={t("ui.foto_pendente_kind", { kind: kindLabel })}
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-[10px] text-foreground-soft">
                      {t("ui.sem_preview")}
                    </div>
                  )}
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-foreground">
                    <span>{kindLabel}</span>
                    <span className="text-warning">{t("ui.pendente")}</span>
                  </div>
                </div>
              );
            })}
            {mediaItems.map((item) => (
              <div
                key={item.path}
                className="overflow-hidden rounded-2xl border border-border bg-white"
              >
                {item.signedUrl ? (
                  <img
                    src={item.signedUrl}
                    alt={t("ui.foto_kind", {
                      kind: mediaKindLabels[item.kind],
                    })}
                    className="h-28 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center text-[10px] text-foreground-soft">
                    {t("ui.url_expirada")}
                  </div>
                )}
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-foreground">
                  <span>{mediaKindLabels[item.kind]}</span>
                  <span className="text-success">{t("ui.enviado")}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {isCheckoutOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
          onClick={handleCloseCheckout}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {t("ui.check_out_do_agendamento")}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("ui.confirme_os_dados_antes_de_finalizar")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-muted">
                <p className="text-[11px] font-semibold text-foreground">
                  {t("ui.resumo_do_apontamento")}
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{t("ui.horario")}</span>
                    <span className="font-semibold text-foreground">
                      {dayLabel} - {formatAppointmentWindow(appointment)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("ui.empresa")}</span>
                    <span className="font-semibold text-foreground">
                      {companyDisplayName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t("ui.oportunidades_percebidas_durante_a_visita")}
                </p>
                <p className="mt-1 text-[11px] text-foreground-muted">
                  {t(
                    "ui.selecione_oportunidades_percebidas_durante_a_visita_opcional",
                  )}
                </p>
                <div className="mt-3 max-h-40 overflow-y-auto pr-1">
                  <div className="grid gap-2">
                    {oportunidadeOptions.map((option) => {
                      const fieldId = `oportunidade-${option.value}`;
                      const checked = checkoutOpportunities.includes(
                        option.value,
                      );
                      return (
                        <label
                          key={option.value}
                          htmlFor={fieldId}
                          className="flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground"
                        >
                          <input
                            id={fieldId}
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleCheckoutOpportunity(option.value)
                            }
                            disabled={isCheckoutBusy}
                            className="h-4 w-4 accent-accent"
                          />
                          <span className="font-semibold">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t("ui.observacoes_do_check_out")}
                </p>
                <p className="mt-1 text-[11px] text-foreground-muted">
                  {t("ui.registre_detalhes_relevantes_da_visita_opcional")}
                </p>
                <textarea
                  value={checkoutObservation}
                  onChange={(event) =>
                    setCheckoutObservation(event.target.value)
                  }
                  placeholder={t("ui.ex_cliente_solicitou_retorno_em_15_dias")}
                  className="mt-3 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  rows={3}
                  disabled={isCheckoutBusy}
                />
              </div>

              {geo.isCapturing && geoIntent === "check_out" ? (
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                  {t("ui.capturando_localizacao_aguarde_alguns_segundos")}
                </div>
              ) : null}
              {photoStatus ? (
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                  {photoStatus}
                </div>
              ) : null}
              {geo.error && geoIntent === "check_out" ? (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                  <p className="font-semibold text-foreground">
                    {geo.error.message}
                  </p>
                  <p className="mt-1 text-foreground-soft">
                    {geo.error.code === "PERMISSION_DENIED"
                      ? t(
                          "ui.permita_localizacao_no_navegador_para_concluir_o_registro",
                        )
                      : t("ui.voce_pode_tentar_novamente_ou_cancelar")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRetryCheckoutGeo}
                      className="rounded-full border border-border bg-white px-3 py-1 text-[10px] font-semibold text-foreground"
                    >
                      {t("ui.tentar_novamente")}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelGeo}
                      className="rounded-full border border-border bg-white px-3 py-1 text-[10px] font-semibold text-foreground-soft"
                    >
                      {t("ui.cancelar")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCloseCheckout}
                disabled={isCheckoutBusy}
                className={`rounded-full border border-border px-4 py-2 text-xs font-semibold ${
                  isCheckoutBusy
                    ? "cursor-not-allowed text-foreground-muted"
                    : "text-foreground-soft"
                }`}
              >
                {t("ui.cancelar")}
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckout}
                disabled={!canCheckOut || busy || isCheckoutBusy}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  canCheckOut && !busy && !isCheckoutBusy
                    ? "bg-info text-white"
                    : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                }`}
              >
                {t("ui.confirmar_check_out")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isAbsenceOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
          onClick={handleCloseAbsence}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {t("ui.justificar_ausencia")}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("ui.selecione_o_motivo_e_confirme_o_registro")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-2xl border border-border bg-surface-muted p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t("ui.motivo")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {absenceOptions.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => setAbsenceReason(reason.value)}
                      className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                        absenceReason === reason.value
                          ? "border-accent bg-white text-foreground"
                          : "border-border bg-white text-foreground-soft"
                      }`}
                    >
                      {reason.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={absenceNote}
                  onChange={(event) => setAbsenceNote(event.target.value)}
                  placeholder={t("ui.descreva_o_motivo")}
                  className="mt-3 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  rows={3}
                />
              </div>
              {photoStatus ? (
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                  {photoStatus}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCloseAbsence}
                disabled={isPhotoBusy}
                className={`rounded-full border border-border px-4 py-2 text-xs font-semibold ${
                  isPhotoBusy
                    ? "cursor-not-allowed text-foreground-muted"
                    : "text-foreground-soft"
                }`}
              >
                {t("ui.cancelar")}
              </button>
              <button
                type="button"
                disabled={!canAbsence || busy || isPhotoBusy}
                onClick={handleAbsence}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  canAbsence && !busy && !isPhotoBusy
                    ? "bg-danger text-white"
                    : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                }`}
              >
                {t("ui.registrar_ausencia")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <CameraCaptureModal
        open={isCameraOpen}
        title={cameraTitle}
        subtitle={t("ui.alinhe_a_camera_e_capture_a_foto")}
        onClose={() => setCameraIntent(null)}
        onConfirm={handleCameraConfirm}
        onError={(message) => setError(message)}
      />
      {isActionsOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
          onClick={handleCloseActions}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {t("ui.acoes_do_agendamento")}
              </h3>
              {/* <p className="mt-1 text-xs text-foreground-muted">
                {t("ui.sincroniza_com_o_supabase")}
              </p> */}
            </div>

            <div className="px-5 py-4">
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={
                    !canCheckIn || busy || geo.isCapturing || isPhotoBusy
                  }
                  onClick={handleCheckIn}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    canCheckIn && !busy && !geo.isCapturing && !isPhotoBusy
                      ? "bg-success text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {isCheckInCapturing
                    ? t("ui.capturando_localizacao")
                    : t("ui.fazer_check_in")}
                </button>
                <button
                  type="button"
                  disabled={
                    !canCheckOut || busy || geo.isCapturing || isPhotoBusy
                  }
                  onClick={handleCheckOut}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    canCheckOut && !busy && !geo.isCapturing && !isPhotoBusy
                      ? "bg-info text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {isCheckOutCapturing
                    ? t("ui.capturando_localizacao")
                    : t("ui.fazer_check_out")}
                </button>
                <button
                  type="button"
                  disabled={!canAbsence || busy || isPhotoBusy}
                  onClick={handleOpenAbsence}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    canAbsence && !busy && !isPhotoBusy
                      ? "bg-danger text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {t("ui.justificar_ausencia")}
                </button>
                {geo.isCapturing ? (
                  <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                    {t("ui.capturando_localizacao_aguarde_alguns_segundos")}
                  </div>
                ) : null}
                {photoStatus ? (
                  <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                    {photoStatus}
                  </div>
                ) : null}
                {geo.error ? (
                  <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                    <p className="font-semibold text-foreground">
                      {geo.error.message}
                    </p>
                    <p className="mt-1 text-foreground-soft">
                      {geo.error.code === "PERMISSION_DENIED"
                        ? t(
                            "ui.permita_localizacao_no_navegador_para_concluir_o_registro",
                          )
                        : t("ui.voce_pode_tentar_novamente_ou_cancelar")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleRetryGeo}
                        className="rounded-full border border-border bg-white px-3 py-1 text-[10px] font-semibold text-foreground"
                      >
                        {t("ui.tentar_novamente")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelGeo}
                        className="rounded-full border border-border bg-white px-3 py-1 text-[10px] font-semibold text-foreground-soft"
                      >
                        {t("ui.cancelar")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCloseActions}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
              >
                {t("ui.fechar")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
