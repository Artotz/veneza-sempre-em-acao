import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
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
import {
  addDays,
  formatDateShort,
  formatTime,
  isSameDay,
  startOfWeekMonday,
} from "../lib/date";
import { formatCurrencyBRL } from "../lib/format";
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
  APPOINTMENT_DETAIL_SELECT,
  COMPANY_DETAIL_SELECT,
  mapAppointment,
  mapCompany,
} from "../lib/supabase";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { Appointment, Company, CompanyContact } from "../lib/types";
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
  getCheckoutDraft,
  saveCheckoutDraft,
  removeCheckoutDraft,
  type PendingScheduleAction,
  updateCompanyLatestContact,
} from "../storage/offlineSchedule";
import { syncAppointment } from "../sync/appointmentSync";
import { compressImage } from "../utils/photoCompress";
import { t } from "../i18n";

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

const atuacaoResultadoLabels: Record<string, string> = {
  vendido: t("ui.vendido"),
  perdido: t("ui.perdido"),
};

type MediaKind = "checkin" | "checkout" | "absence" | "registro";
type RegistroTipo =
  | "reconexao"
  | "medicao_mr"
  | "proposta_preventiva"
  | "proposta_powergard"
  | "outro";

const registroOptions: { label: string; value: RegistroTipo }[] = [
  { label: t("ui.reconexao"), value: "reconexao" },
  { label: t("ui.medicao_mr"), value: "medicao_mr" },
  { label: t("ui.proposta_preventiva"), value: "proposta_preventiva" },
  { label: t("ui.proposta_powergard"), value: "proposta_powergard" },
  { label: t("ui.outro"), value: "outro" },
];

const registroLabels = Object.fromEntries(
  registroOptions.map((option) => [option.value, option.label]),
) as Record<RegistroTipo, string>;

type PendingGeoAction =
  | {
      intent: "check_in";
      shot: CapturePhotoResult;
    }
  | {
      intent: "check_out";
      oportunidades: string[];
      notes: string | null;
      receiverName: string;
      receiverContact: string;
      clientThermometer: number | null;
    };

type ApontamentoMediaRow = {
  id?: string;
  bucket: string;
  path: string;
  kind: MediaKind;
  registro_tipo?: string | null;
  mime_type?: string | null;
  bytes?: number | null;
  created_at?: string | null;
};

type ApontamentoAcaoRow = {
  id?: string;
  resultado: string;
  nf_ou_os?: string | null;
  valor?: number | null;
  motivo_perda?: string | null;
  observacao?: string | null;
  created_at?: string | null;
};

type AppointmentMediaItem = {
  id?: string;
  bucket: string;
  path: string;
  kind: MediaKind;
  registroTipo?: string | null;
  mimeType: string | null;
  bytes: number;
  createdAt?: string | null;
  signedUrl: string | null;
  fileName?: string | null;
};

type OfflinePhotoPreview = OfflinePhotoMeta & {
  previewUrl: string | null;
};

const mediaKindLabels: Record<MediaKind, string> = {
  checkin: t("ui.check_in"),
  checkout: t("ui.check_out"),
  absence: t("ui.ausencia"),
  registro: t("ui.registro"),
};

const getRegistroLabel = (registroTipo?: string | null) => {
  if (!registroTipo) return null;
  return registroLabels[registroTipo as RegistroTipo] ?? registroTipo;
};

const buildRegistroItemLabel = (
  index: number,
  registroTipo?: string | null,
) => {
  const tipoLabel = getRegistroLabel(registroTipo);
  if (tipoLabel) {
    return t("ui.registro_numero_tipo", { numero: index, tipo: tipoLabel });
  }
  return t("ui.registro_numero", { numero: index });
};

const MAX_REGISTROS = 10;
const NON_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
];
const ACCEPTED_FILE_TYPES_INPUT = ["image/*", ...ACCEPTED_FILE_TYPES].join(
  ", ",
);

const NEW_CONTACT_ID = "new-contact";
const DASHBOARD_APPOINTMENT_BASE_URL =
  "https://venezafieldservicedashboard.vercel.app/cronograma";

const partsConsultants = [
  { nameKey: "ui.consultor_pecas_ana_rocha", phone: "+55 81 8940-1727" },
  { nameKey: "ui.consultor_pecas_david_santana", phone: "+55 87 9195-4758" },
  { nameKey: "ui.consultor_pecas_diogo_satiro", phone: "+55 81 9251-5560" },
  {
    nameKey: "ui.consultor_pecas_edmilson_almeida",
    phone: "+55 71 8270-8091",
  },
  {
    nameKey: "ui.consultor_pecas_natalia_mendonca",
    phone: "+55 81 9272-8634",
  },
  { nameKey: "ui.consultor_pecas_rannyel_borges", phone: "+55 83 9196-7885" },
  { nameKey: "ui.consultor_pecas_weldon_santos", phone: "+55 71 8187-0122" },
  { nameKey: "ui.consultor_pecas_marcos_ferreira", phone: "+55 73 8178-1690" },
  {
    nameKey: "ui.consultor_pecas_marcelo_andrade",
    phone: "+55 81 7329-0717",
  },
  { nameKey: "ui.consultor_pecas_breno_sousa", phone: "+55 85 9125-9600" },
] as const;

const isImageMime = (mimeType?: string | null) =>
  Boolean(mimeType && mimeType.startsWith("image/"));

const isSupportedMime = (mimeType: string) =>
  mimeType.startsWith("image/") || ACCEPTED_FILE_TYPES.includes(mimeType);

const filenameFromPath = (path?: string | null) => {
  if (!path) return null;
  const parts = path.split("/");
  const last = parts[parts.length - 1]?.trim();
  return last || null;
};

const mimeToExtension = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return "jpg";
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "application/msword") return "doc";
  if (
    normalized ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (normalized === "application/vnd.ms-excel") return "xls";
  if (
    normalized ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  if (normalized === "application/vnd.ms-powerpoint") return "ppt";
  if (
    normalized ===
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx";
  }
  if (normalized === "text/csv") return "csv";
  if (normalized === "text/plain") return "txt";
  return "bin";
};

const buildWhatsAppUrl = (phone: string, message: string) => {
  const digitsOnly = phone.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
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

const toStringValue = (value: unknown) =>
  typeof value === "string" ? value : null;

const toNumberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toStringArrayValue = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;

const applyPendingActionsToAppointment = (
  appointment: Appointment,
  pendingActions: PendingScheduleAction[],
) => {
  if (!pendingActions.length) return appointment;
  const sorted = [...pendingActions].sort((a, b) => a.createdAt - b.createdAt);
  const next = sorted.reduce<Appointment>((current, action) => {
    const changes = action.changes ?? {};
    if (action.actionType === "reschedule") {
      const startAt =
        toStringValue(changes.starts_at) ??
        toStringValue(changes.startAt) ??
        current.startAt;
      const endAt =
        toStringValue(changes.ends_at) ??
        toStringValue(changes.endAt) ??
        current.endAt;
      return {
        ...current,
        startAt,
        endAt,
      };
    }
    if (action.actionType === "checkIn") {
      return {
        ...current,
        status:
          (toStringValue(changes.status) as Appointment["status"]) ??
          "in_progress",
        checkInAt: toStringValue(changes.check_in_at) ?? current.checkInAt,
        checkInLat:
          toNumberValue(changes.check_in_lat) ?? current.checkInLat ?? null,
        checkInLng:
          toNumberValue(changes.check_in_lng) ?? current.checkInLng ?? null,
        checkInAccuracyM:
          toNumberValue(changes.check_in_accuracy_m) ??
          current.checkInAccuracyM ??
          null,
      };
    }
    if (action.actionType === "checkOut") {
      const hasNotes = Object.prototype.hasOwnProperty.call(changes, "notes");
      return {
        ...current,
        status:
          (toStringValue(changes.status) as Appointment["status"]) ?? "done",
        checkOutAt: toStringValue(changes.check_out_at) ?? current.checkOutAt,
        checkOutLat:
          toNumberValue(changes.check_out_lat) ?? current.checkOutLat ?? null,
        checkOutLng:
          toNumberValue(changes.check_out_lng) ?? current.checkOutLng ?? null,
        checkOutAccuracyM:
          toNumberValue(changes.check_out_accuracy_m) ??
          current.checkOutAccuracyM ??
          null,
        notes: hasNotes
          ? toStringValue(changes.notes)
          : (current.notes ?? null),
        oportunidades: Array.isArray(changes.oportunidades)
          ? (changes.oportunidades as string[])
          : current.oportunidades,
        sharedWith:
          toStringArrayValue(changes.shared_with) ?? current.sharedWith,
        clientThermometer:
          toNumberValue(changes.client_thermometer) ??
          current.clientThermometer ??
          null,
      };
    }
    if (action.actionType === "share") {
      return {
        ...current,
        sharedWith:
          toStringArrayValue(changes.shared_with) ?? current.sharedWith,
      };
    }
    if (action.actionType === "companyContact") {
      return current;
    }
    if (action.actionType === "absence") {
      return {
        ...current,
        status:
          (toStringValue(changes.status) as Appointment["status"]) ?? "absent",
        absenceReason:
          toStringValue(changes.absence_reason) ?? current.absenceReason,
        absenceNote: toStringValue(changes.absence_note) ?? current.absenceNote,
      };
    }
    return {
      ...current,
    };
  }, appointment);

  return {
    ...next,
    pendingSync: true,
  };
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
  const [pendingGeoAction, setPendingGeoAction] =
    useState<PendingGeoAction | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [cameraIntent, setCameraIntent] = useState<
    "checkin" | "registro" | null
  >(null);
  const [isRegistroModalOpen, setIsRegistroModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [registroTipo, setRegistroTipo] = useState<RegistroTipo | "">("");
  const [pendingRegistroTipo, setPendingRegistroTipo] =
    useState<RegistroTipo | null>(null);
  const [mediaItems, setMediaItems] = useState<AppointmentMediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [atuacao, setAtuacao] = useState<ApontamentoAcaoRow | null>(null);
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
  const [checkoutDraftHydrated, setCheckoutDraftHydrated] = useState(false);
  const hasCheckoutDraftRef = useRef(false);
  const checkoutDraftSaveTimeout = useRef<number | null>(null);
  const registroFileInputRef = useRef<HTMLInputElement | null>(null);
  const [detailsTab, setDetailsTab] = useState<"fotos" | "mapa" | "recursos">(
    "fotos",
  );
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"summary" | "receiver">(
    "summary",
  );
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
  const [receiverName, setReceiverName] = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [contactOptions, setContactOptions] = useState<CompanyContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [clientThermometer, setClientThermometer] = useState<number>(5);
  const [pendingClientThermometer, setPendingClientThermometer] = useState<
    number | null
  >(null);
  const [showCheckInMarker, setShowCheckInMarker] = useState(true);
  const [showCheckOutMarker, setShowCheckOutMarker] = useState(true);

  const geo = useGeolocation();
  const isCameraOpen = cameraIntent !== null;
  const isGeoModalOpen =
    geo.isCapturing || Boolean(geo.error && pendingGeoAction);
  useLockBodyScroll(
    isCheckoutOpen ||
      isAbsenceOpen ||
      isCameraOpen ||
      isGeoModalOpen ||
      isRegistroModalOpen ||
      isShareModalOpen,
  );

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

  useEffect(() => {
    hasCheckoutDraftRef.current = false;
    setCheckoutDraftHydrated(false);
    const userEmail = user?.email?.trim();
    if (!appointment?.id || !userEmail) return;
    let isActive = true;
    void (async () => {
      const draft = await getCheckoutDraft(userEmail);
      if (!isActive) return;
      if (draft && draft.appointmentId === appointment.id) {
        hasCheckoutDraftRef.current = true;
        setCheckoutOpportunities(draft.oportunidades ?? []);
        setCheckoutObservation(draft.notes ?? "");
        setReceiverName(draft.receiverName ?? "");
        setReceiverContact(draft.receiverContact ?? "");
        setSelectedContactId(draft.selectedContactId ?? "");
        setClientThermometer(draft.clientThermometer ?? 5);
        setCheckoutStep(draft.step ?? "summary");
      }
      setCheckoutDraftHydrated(true);
    })();
    return () => {
      isActive = false;
    };
  }, [appointment?.id, user?.email]);

  useEffect(() => {
    const userEmail = user?.email?.trim();
    if (!appointment?.id || !userEmail || !checkoutDraftHydrated) return;
    if (!isCheckoutOpen) return;
    const hasData =
      checkoutObservation.trim().length > 0 ||
      checkoutOpportunities.length > 0 ||
      receiverName.trim().length > 0 ||
      receiverContact.trim().length > 0 ||
      selectedContactId.trim().length > 0 ||
      clientThermometer !== 5 ||
      checkoutStep !== "summary";

    if (!hasData) return;

    if (checkoutDraftSaveTimeout.current) {
      window.clearTimeout(checkoutDraftSaveTimeout.current);
    }

    checkoutDraftSaveTimeout.current = window.setTimeout(() => {
      void saveCheckoutDraft(userEmail, appointment.id, {
        oportunidades: checkoutOpportunities,
        notes: checkoutObservation,
        receiverName,
        receiverContact,
        selectedContactId,
        clientThermometer,
        step: checkoutStep,
      });
    }, 300);

    return () => {
      if (checkoutDraftSaveTimeout.current) {
        window.clearTimeout(checkoutDraftSaveTimeout.current);
      }
    };
  }, [
    appointment?.id,
    checkoutDraftHydrated,
    checkoutObservation,
    checkoutOpportunities,
    checkoutStep,
    clientThermometer,
    isCheckoutOpen,
    receiverContact,
    receiverName,
    selectedContactId,
    user?.email,
  ]);

  useEffect(() => {
    if (!appointment?.startAt) return;
    const baseDate = new Date(appointment.startAt);
    const startAt = startOfWeekMonday(baseDate);
    const endAt = addDays(startAt, 6);
    actions.setRange({ startAt, endAt });
  }, [actions, appointment?.startAt]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    if (authLoading) return;
    const hasLocal = Boolean(appointmentFromState);
    if (hasLocal) {
      setError(null);
      setAppointment(appointmentFromState ?? null);
      if (companyFromState) {
        setCompany(companyFromState);
      }
      setLoading(false);
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
    if (!hasLocal) {
      setLoading(true);
    }
    setError(null);
    const { data, error: requestError } = await supabase
      .from("apontamentos")
      .select(
        `${APPOINTMENT_DETAIL_SELECT}, companies(${COMPANY_DETAIL_SELECT})`,
      )
      .eq("id", id)
      .eq("consultant_name", userEmail)
      .maybeSingle();

    if (requestError) {
      if (!hasLocal) {
        setError(requestError.message);
        setLoading(false);
      }
      return;
    }

    if (!data) {
      if (!hasLocal) {
        setError(t("ui.agendamento_nao_encontrado_2"));
        setLoading(false);
      }
      return;
    }

    const mappedAppointment = mapAppointment(data);
    const rawCompany = Array.isArray(data.companies)
      ? data.companies[0]
      : data.companies;
    const mappedCompany = rawCompany ? mapCompany(rawCompany) : null;

    let resolvedAppointment = mappedAppointment;
    const pendingActions = await listPendingActions(userEmail);
    const scopedActions = pendingActions.filter(
      (item) => item.appointmentId === mappedAppointment.id,
    );
    if (scopedActions.length) {
      resolvedAppointment = applyPendingActionsToAppointment(
        mappedAppointment,
        scopedActions,
      );
    }

    setAppointment(resolvedAppointment);
    setCompany(mappedCompany);
    setAbsenceReason(resolvedAppointment.absenceReason ?? "");
    setAbsenceNote(resolvedAppointment.absenceNote ?? "");
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
      .select(
        "id, bucket, path, kind, registro_tipo, mime_type, bytes, created_at",
      )
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
          registroTipo: item.registro_tipo ?? null,
          mimeType: item.mime_type ?? null,
          bytes: item.bytes ?? 0,
          createdAt: item.created_at ?? null,
          signedUrl: signedError ? null : (signedData?.signedUrl ?? null),
          fileName: filenameFromPath(item.path),
        } as AppointmentMediaItem;
      }),
    );

    setMediaItems(signedItems);
    setMediaLoading(false);
  }, [id, isOnline, supabase]);

  const loadAtuacao = useCallback(async () => {
    if (!id) return;
    if (!isOnline) {
      setAtuacao(null);
      return;
    }

    const { data, error: requestError } = await supabase
      .from("apontamento_acoes")
      .select(
        "id, resultado, nf_ou_os, valor, motivo_perda, observacao, created_at",
      )
      .eq("apontamento_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError) {
      setAtuacao(null);
      return;
    }

    setAtuacao((data ?? null) as ApontamentoAcaoRow | null);
  }, [id, isOnline, supabase]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    void loadAtuacao();
  }, [loadAtuacao]);

  useEffect(() => {
    let active = true;

    const loadContacts = async () => {
      if (!appointment?.companyId) return;
      setContactsError(null);

      if (!isOnline) {
        const cached = company?.latestContact ?? null;
        setContactOptions(cached ? [cached] : []);
        setContactsLoading(false);
        return;
      }

      setContactsLoading(true);
      const { data, error } = await supabase
        .from("company_contacts")
        .select("id, company_id, name, contact, created_at")
        .eq("company_id", appointment.companyId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!active) return;

      if (error) {
        setContactOptions([]);
        setContactsError(error.message);
        setContactsLoading(false);
        return;
      }

      const mapped = (data ?? []).map((row) => ({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        contact: row.contact,
        createdAt: row.created_at ?? null,
      })) as CompanyContact[];

      setContactOptions(mapped);
      setContactsLoading(false);

      const latest = mapped[0] ?? null;
      const userEmail = user?.email?.trim();
      if (userEmail && latest) {
        await updateCompanyLatestContact(
          userEmail,
          appointment.companyId,
          latest,
        );
      }
    };

    if (isCheckoutOpen) {
      void loadContacts();
    }

    return () => {
      active = false;
    };
  }, [
    appointment?.companyId,
    company?.latestContact,
    isCheckoutOpen,
    isOnline,
    supabase,
    user?.email,
  ]);

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
    if (!selectedContactId || selectedContactId === NEW_CONTACT_ID) return;
    const stillExists = contactOptions.some(
      (contact) => contact.id === selectedContactId,
    );
    if (!stillExists) {
      setSelectedContactId("");
    }
  }, [contactOptions, selectedContactId]);

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
          if (blob && isImageMime(blob.type)) {
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
    async (
      kind: MediaKind,
      shot: CapturePhotoResult,
      registroTipoValue?: RegistroTipo | null,
    ) => {
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
        registroTipo: registroTipoValue ?? undefined,
        consultantId,
        originalName: shot.originalName,
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
      clientThermometer?: number | null;
    }) => {
      const changes: Record<string, unknown> = {
        check_out_at: payload.at,
        status: "done",
        oportunidades: payload.oportunidades,
        notes: payload.notes ?? null,
      };
      if (payload.clientThermometer != null) {
        changes.client_thermometer = payload.clientThermometer;
      }
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
    async (
      kind: MediaKind,
      shot: CapturePhotoResult,
      registroTipoValue?: RegistroTipo | null,
    ) => {
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
        originalName: shot.originalName,
      });

      const { error: insertError } = await supabase
        .from("apontamento_media")
        .insert({
          apontamento_id: appointment.id,
          bucket: upload.bucket,
          path: upload.path,
          kind,
          registro_tipo: registroTipoValue ?? null,
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
      actionType: "checkIn" | "checkOut" | "absence" | "share";
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
          originalName: params.shot.originalName,
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
    async (params: {
      kind: MediaKind;
      shot: CapturePhotoResult;
      registroTipo?: RegistroTipo | null;
    }) => {
      await storeOfflinePhoto(
        params.kind,
        params.shot,
        params.registroTipo ?? null,
      );
      if (appointment) {
        actions.setPendingSync(appointment.id, true);
      }
    },
    [actions, appointment, storeOfflinePhoto],
  );

  const createPendingAction = useCallback(
    async (params: {
      actionType: "checkIn" | "checkOut" | "absence" | "share";
      changes: Record<string, unknown>;
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
      actions.setPendingSync(appointment.id, true);
      await loadPendingActions();
      return pendingAction;
    },
    [actions, appointment, loadPendingActions, user?.email],
  );

  const queuePendingCompanyContact = useCallback(
    async (changes: Record<string, unknown>) => {
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
        actionType: "companyContact",
        changes,
      });
      actions.setPendingSync(appointment.id, true);
      await loadPendingActions();
    },
    [actions, appointment, loadPendingActions, user?.email],
  );

  const clearPendingAction = useCallback(
    async (id: string) => {
      if (!appointment) return;
      const userEmail = user?.email?.trim();
      if (!userEmail) return;
      await removePendingAction(id);
      const pending = await listPendingActions(userEmail);
      const stillPending = pending.some(
        (item) => item.appointmentId === appointment.id,
      );
      actions.setPendingSync(appointment.id, stillPending);
      await loadPendingActions();
    },
    [actions, appointment, loadPendingActions, user?.email],
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

        const pendingAction = await createPendingAction({
          actionType: "checkIn",
          changes,
        });

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          await queuePendingPhotoOnly({ kind: "checkin", shot: params.shot });
          return;
        }

        await clearPendingAction(pendingAction.id);

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
      clearPendingAction,
      createPendingAction,
      loadMedia,
      queuePendingActionWithPhoto,
      queuePendingPhotoOnly,
      updateAppointmentRemote,
      uploadPhotoRemote,
    ],
  );

  const syncCheckOut = useCallback(
    async (params: {
      at: string;
      position: { lat: number; lng: number; accuracy: number } | null;
      oportunidades: string[];
      notes?: string | null;
      clientThermometer?: number | null;
    }) => {
      try {
        const changes = buildCheckOutRemoteChanges({
          at: params.at,
          lat: params.position?.lat ?? null,
          lng: params.position?.lng ?? null,
          accuracy: params.position?.accuracy ?? null,
          oportunidades: params.oportunidades,
          notes: params.notes ?? null,
          clientThermometer: params.clientThermometer ?? null,
        });

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queuePendingActionOnly({
            actionType: "checkOut",
            changes,
          });
          return;
        }

        const pendingAction = await createPendingAction({
          actionType: "checkOut",
          changes,
        });

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          return;
        }

        await clearPendingAction(pendingAction.id);
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
      clearPendingAction,
      createPendingAction,
      queuePendingActionOnly,
      updateAppointmentRemote,
    ],
  );

  const syncCompanyContact = useCallback(
    async (payload: { name: string; contact: string }) => {
      if (!appointment) return;
      const normalizedName = payload.name.trim();
      const normalizedContact = payload.contact.trim();
      if (!normalizedName || !normalizedContact) return;
      const userEmail = user?.email?.trim();
      if (!userEmail) return;
      const changes = {
        company_id: appointment.companyId,
        name: normalizedName,
        contact: normalizedContact,
      };
      const localContact = {
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        companyId: appointment.companyId,
        name: normalizedName,
        contact: normalizedContact,
        appointmentId: appointment.id,
        createdAt: new Date().toISOString(),
      };

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          await queuePendingCompanyContact(changes);
          await updateCompanyLatestContact(
            userEmail,
            appointment.companyId,
            localContact,
          );
          return;
        }

        const { error } = await supabase
          .from("company_contacts")
          .insert(changes);

        if (error) {
          await queuePendingCompanyContact(changes);
          await updateCompanyLatestContact(
            userEmail,
            appointment.companyId,
            localContact,
          );
          return;
        }
        await updateCompanyLatestContact(
          userEmail,
          appointment.companyId,
          localContact,
        );
      } catch (error) {
        await queuePendingCompanyContact(changes);
        await updateCompanyLatestContact(
          userEmail,
          appointment.companyId,
          localContact,
        );
      }
    },
    [appointment, queuePendingCompanyContact, supabase, user?.email],
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

        const pendingAction = await createPendingAction({
          actionType: "absence",
          changes,
        });

        try {
          await updateAppointmentRemote(changes);
        } catch (error) {
          return;
        }

        await clearPendingAction(pendingAction.id);
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
      clearPendingAction,
      createPendingAction,
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

  const registrosRealizados = useMemo(() => {
    const tipos = new Set<string>();
    pendingPhotos.forEach((item) => {
      if (item.kind === "registro" && item.registroTipo) {
        tipos.add(item.registroTipo);
      }
    });
    mediaItems.forEach((item) => {
      if (item.kind === "registro" && item.registroTipo) {
        tipos.add(item.registroTipo);
      }
    });
    return registroOptions.filter((option) => tipos.has(option.value));
  }, [mediaItems, pendingPhotos]);

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
          to="/calendario/dia"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          {t("ui.voltar_para_o_dia")}
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
  const hasEarlierScheduled = dayAppointments.some((item) => {
    if (item.id === appointment.id) return false;
    if (getAppointmentStatus(item) !== "agendado") return false;
    return (
      new Date(item.startAt).getTime() < new Date(appointment.startAt).getTime()
    );
  });
  const canCheckIn =
    !blocked &&
    !hasEarlierScheduled &&
    isTodayAppointment &&
    (appointment.status ?? "scheduled") === "scheduled";
  const canCheckOut =
    !blocked &&
    isTodayAppointment &&
    (appointment.status ?? "scheduled") === "in_progress";
  const canAbsence =
    status === "agendado" || status === "expirado" || status === "em_execucao";
  const canEditVisit = status === "agendado";
  const showAddPhoto =
    status === "em_execucao" || status === "concluido" || status === "atuado";
  const showShareVisit = status === "concluido";
  const showEditVisit = status !== "em_execucao" && status !== "concluido";
  const showAbsenceButton = status !== "concluido" && status !== "atuado";
  const isCheckInCapturing = geo.isCapturing && geoIntent === "check_in";
  const isCheckOutCapturing = geo.isCapturing && geoIntent === "check_out";
  const isPhotoBusy = Boolean(photoStatus) || isCameraOpen;
  const isCheckoutBusy = isPhotoBusy || geo.isCapturing;
  const isAbsenceNoteValid = absenceNote.trim().length > 0;

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
    const hasDraft = hasCheckoutDraftRef.current;
    if (!hasDraft) {
      setCheckoutOpportunities([]);
      setCheckoutObservation(appointment?.notes ?? "");
      setReceiverName("");
      setReceiverContact("");
      setSelectedContactId("");
      setClientThermometer(appointment?.clientThermometer ?? 5);
      setCheckoutStep("summary");
    }
    setPendingCheckoutOpportunities(null);
    setPendingCheckoutObservation(null);
    setPendingClientThermometer(null);
    setIsCheckoutOpen(true);
  };

  const handleCheckInOut = () => {
    if (canCheckIn) {
      handleCheckIn();
      return;
    }
    if (canCheckOut) {
      handleCheckOut();
    }
  };

  const openRegistroModal = () => {
    if (!canAddPhoto || isPhotoBusy || registroCount >= MAX_REGISTROS) return;
    setRegistroTipo("");
    setPendingRegistroTipo(null);
    setIsRegistroModalOpen(true);
  };

  const handleAddRegistroPhoto = () => {
    openRegistroModal();
  };

  const handleCloseRegistroModal = () => {
    if (isPhotoBusy) return;
    setIsRegistroModalOpen(false);
    setRegistroTipo("");
    setPendingRegistroTipo(null);
  };

  const handleConfirmRegistroModal = (action: "camera" | "file") => {
    if (!registroTipo) return;
    setPendingRegistroTipo(registroTipo);
    setIsRegistroModalOpen(false);
    setRegistroTipo("");
    if (action === "camera") {
      setCameraIntent("registro");
      return;
    }
    window.setTimeout(() => {
      registroFileInputRef.current?.click();
    }, 0);
  };

  const handleRegistroFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setError(null);
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    const registroTipoValue = pendingRegistroTipo;
    setPendingRegistroTipo(null);

    if (!files.length) return;

    if (!registroTipoValue) {
      setError(t("ui.selecione_o_tipo_de_registro"));
      return;
    }

    if (registroCount >= MAX_REGISTROS) {
      setError(t("ui.limite_de_registros_atingido", { max: MAX_REGISTROS }));
      return;
    }

    const available = Math.max(0, MAX_REGISTROS - registroCount);
    const toProcess = files.slice(0, available);

    if (files.length > available) {
      setError(t("ui.limite_de_registros_atingido", { max: MAX_REGISTROS }));
    }

    for (const file of toProcess) {
      const mimeType = file.type?.trim() ?? "";
      const normalizedMime = mimeType.toLowerCase();

      if (!normalizedMime || !isSupportedMime(normalizedMime)) {
        setError(t("ui.formato_de_arquivo_nao_suportado"));
        continue;
      }

      if (!isImageMime(normalizedMime) && file.size > NON_IMAGE_MAX_BYTES) {
        setError(
          t("ui.arquivo_muito_grande", {
            max: Math.round(NON_IMAGE_MAX_BYTES / (1024 * 1024)),
          }),
        );
        continue;
      }

      try {
        const blob = isImageMime(normalizedMime)
          ? await compressImage(file)
          : file;
        const shot: CapturePhotoResult = {
          blob,
          mimeType: blob.type || normalizedMime,
          extension: mimeToExtension(blob.type || normalizedMime),
          originalName: file.name,
        };
        await performRegistroUpload(shot, registroTipoValue);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : t("ui.nao_foi_possivel_salvar_a_foto"),
        );
      }
    }
  };

  const handleEditVisit = () => {
    if (!canEditVisit) return;
    navigate(`/apontamentos/${appointment.id}/editar`);
  };

  const handleOpenShareModal = () => {
    setIsShareModalOpen(true);
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
  };

  const handleShareWithConsultant = async (
    consultantName: string,
    phone: string,
  ) => {
    if (!appointment) return;
    setError(null);

    const nextSharedWith = Array.from(
      new Set([...(appointment.sharedWith ?? []), consultantName]),
    );
    const changes = { shared_with: nextSharedWith };
    setAppointment((current) =>
      current ? { ...current, sharedWith: nextSharedWith } : current,
    );

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queuePendingActionOnly({ actionType: "share", changes });
      } else {
        await updateAppointmentRemote(changes);
      }
    } catch (error) {
      try {
        await queuePendingActionOnly({ actionType: "share", changes });
      } catch (pendingError) {
        setError(
          pendingError instanceof Error
            ? pendingError.message
            : error instanceof Error
              ? error.message
              : t("ui.nao_foi_possivel_salvar_o_compartilhamento"),
        );
      }
    }

    const url = buildWhatsAppUrl(phone, whatsappShareMessage);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCloseCheckout = () => {
    if (isCheckoutBusy) return;
    const userEmail = user?.email?.trim();
    if (appointment?.id && userEmail) {
      void removeCheckoutDraft(userEmail);
    }
    setIsCheckoutOpen(false);
    setCheckoutStep("summary");
    setCheckoutOpportunities([]);
    setPendingCheckoutOpportunities(null);
    setCheckoutObservation("");
    setPendingCheckoutObservation(null);
    setReceiverName("");
    setReceiverContact("");
    setSelectedContactId("");
    setClientThermometer(5);
    setPendingClientThermometer(null);
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

  const handleContinueCheckout = () => {
    if (!canCheckOut || busy || geo.isCapturing || isPhotoBusy) return;
    setError(null);
    const oportunidades = [...checkoutOpportunities];
    setPendingCheckoutOpportunities(oportunidades);
    const normalizedObservation = checkoutObservation.trim();
    const notes = normalizedObservation.length ? normalizedObservation : null;
    setPendingCheckoutObservation(notes);
    setCheckoutStep("receiver");
  };

  const handleSelectContact = (value: string) => {
    setSelectedContactId(value);
    if (!value || value === NEW_CONTACT_ID) {
      setReceiverName("");
      setReceiverContact("");
      return;
    }
    const existing = contactOptions.find((contact) => contact.id === value);
    if (!existing) return;
    setReceiverName(existing.name ?? "");
    setReceiverContact(existing.contact ?? "");
  };

  const handleFinalizeCheckout = () => {
    if (!canCheckOut || busy || geo.isCapturing || isPhotoBusy) return;
    const normalizedName = receiverName.trim();
    const normalizedContact = receiverContact.trim();
    if (!normalizedName || !normalizedContact) return;
    setError(null);
    const oportunidades = pendingCheckoutOpportunities ?? [
      ...checkoutOpportunities,
    ];
    const notes =
      pendingCheckoutObservation ??
      (checkoutObservation.trim().length ? checkoutObservation.trim() : null);
    setPendingClientThermometer(clientThermometer);
    setIsCheckoutOpen(false);
    setCheckoutStep("summary");
    setSelectedContactId("");
    void performCheckOut({
      oportunidades,
      notes,
      receiverName: normalizedName,
      receiverContact: normalizedContact,
      clientThermometer,
    });
  };

  const handleSkipCheckoutContact = () => {
    if (!canCheckOut || busy || geo.isCapturing || isPhotoBusy) return;
    setError(null);
    const oportunidades = pendingCheckoutOpportunities ?? [
      ...checkoutOpportunities,
    ];
    const notes =
      pendingCheckoutObservation ??
      (checkoutObservation.trim().length ? checkoutObservation.trim() : null);
    setPendingClientThermometer(clientThermometer);
    setReceiverName("");
    setReceiverContact("");
    setSelectedContactId("");
    setIsCheckoutOpen(false);
    setCheckoutStep("summary");
    void performCheckOut({
      oportunidades,
      notes,
      receiverName: "",
      receiverContact: "",
      clientThermometer,
    });
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
    setSyncStatus(t("ui.sincronizando_apontamento"));
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
      setSyncStatus(t("ui.sincronizacao_concluida"));
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

  const finalizeCheckIn = async ({
    shot,
    position,
  }: {
    shot: CapturePhotoResult;
    position: { lat: number; lng: number; accuracy: number } | null;
  }) => {
    const now = new Date().toISOString();
    setAppointment((current) =>
      current
        ? {
            ...current,
            checkInAt: now,
            status: "in_progress",
            checkInLat: position?.lat ?? null,
            checkInLng: position?.lng ?? null,
            checkInAccuracyM: position?.accuracy ?? null,
          }
        : current,
    );
    const updated = await actions.checkIn(appointment.id, {
      at: now,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracy: position?.accuracy ?? null,
    });
    if (updated) {
      setAppointment(updated);
    }
    setGeoIntent(null);
    setPendingGeoAction(null);
    setPhotoStatus(null);
    void syncCheckIn({ shot, at: now, position });
  };

  const finalizeCheckOut = async ({
    position,
    oportunidades,
    notes,
    clientThermometer,
    receiverName,
    receiverContact,
  }: {
    position: { lat: number; lng: number; accuracy: number } | null;
    oportunidades: string[];
    notes: string | null;
    clientThermometer: number | null;
    receiverName: string;
    receiverContact: string;
  }) => {
    const now = new Date().toISOString();
    const userEmail = user?.email?.trim();
    if (appointment?.id && userEmail) {
      void removeCheckoutDraft(userEmail);
    }
    setAppointment((current) =>
      current
        ? {
            ...current,
            checkOutAt: now,
            status: "done",
            checkOutLat: position?.lat ?? null,
            checkOutLng: position?.lng ?? null,
            checkOutAccuracyM: position?.accuracy ?? null,
            oportunidades: oportunidades ?? [],
            notes,
            clientThermometer,
          }
        : current,
    );
    const updated = await actions.checkOut(appointment.id, {
      at: now,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracy: position?.accuracy ?? null,
      oportunidades: oportunidades ?? [],
      notes,
      clientThermometer,
    });
    if (updated) {
      setAppointment(updated);
    }
    setGeoIntent(null);
    setPendingGeoAction(null);
    setCheckoutOpportunities([]);
    setPendingCheckoutOpportunities(null);
    setCheckoutObservation("");
    setPendingCheckoutObservation(null);
    setReceiverName("");
    setReceiverContact("");
    setClientThermometer(5);
    setPendingClientThermometer(null);
    setPhotoStatus(null);
    void syncCheckOut({
      at: now,
      position,
      oportunidades: oportunidades ?? [],
      notes,
      clientThermometer,
    });
    if (shouldPersistContact) {
      void syncCompanyContact({
        name: receiverName,
        contact: receiverContact,
      });
    }
  };

  const performCheckIn = async (shot: CapturePhotoResult) => {
    if (!canCheckIn || busy || geo.isCapturing) return;
    setError(null);
    setSyncStatus(null);
    geo.resetError();
    setGeoIntent("check_in");
    setPendingGeoAction(null);
    try {
      let position: { lat: number; lng: number; accuracy: number } | null =
        null;
      try {
        position = await geo.capture();
      } catch (geoError) {
        if (isGeoError(geoError)) {
          setPendingGeoAction({
            intent: "check_in",
            shot,
          });
          return;
        } else {
          throw geoError;
        }
      }
      await finalizeCheckIn({ shot, position });
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

  const performCheckOut = async (overrides?: {
    oportunidades: string[];
    notes: string | null;
    receiverName: string;
    receiverContact: string;
    clientThermometer: number | null;
  }) => {
    if (!canCheckOut || busy || geo.isCapturing) return;
    setError(null);
    setSyncStatus(null);
    geo.resetError();
    setGeoIntent("check_out");
    setPendingGeoAction(null);
    const oportunidades =
      overrides?.oportunidades ??
      pendingCheckoutOpportunities ??
      checkoutOpportunities;
    const observationSource =
      overrides?.notes ?? pendingCheckoutObservation ?? checkoutObservation;
    const normalizedObservation = observationSource.trim();
    const notes = normalizedObservation.length ? normalizedObservation : null;
    const receiverNameValue =
      overrides?.receiverName?.trim() ?? receiverName.trim();
    const receiverContactValue =
      overrides?.receiverContact?.trim() ?? receiverContact.trim();
    const thermometerValue =
      overrides?.clientThermometer ??
      pendingClientThermometer ??
      clientThermometer;
    try {
      let position: { lat: number; lng: number; accuracy: number } | null =
        null;
      try {
        position = await geo.capture();
      } catch (geoError) {
        if (isGeoError(geoError)) {
          setPendingGeoAction({
            intent: "check_out",
            oportunidades: oportunidades ?? [],
            notes,
            receiverName: receiverNameValue,
            receiverContact: receiverContactValue,
            clientThermometer: thermometerValue,
          });
          return;
        } else {
          throw geoError;
        }
      }
      await finalizeCheckOut({
        position,
        oportunidades: oportunidades ?? [],
        notes,
        receiverName: receiverNameValue,
        receiverContact: receiverContactValue,
        clientThermometer: thermometerValue,
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

  const performRegistroUpload = async (
    shot: CapturePhotoResult,
    registroTipoValue?: RegistroTipo | null,
  ) => {
    if (!appointment) return;
    setError(null);
    setSyncStatus(null);
    try {
      if (!registroTipoValue) {
        throw new Error(t("ui.selecione_o_tipo_de_registro"));
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queuePendingPhotoOnly({
          kind: "registro",
          shot,
          registroTipo: registroTipoValue,
        });
        return;
      }

      try {
        await uploadPhotoRemote("registro", shot, registroTipoValue);
        await loadMedia();
      } catch (error) {
        await queuePendingPhotoOnly({
          kind: "registro",
          shot,
          registroTipo: registroTipoValue,
        });
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("ui.nao_foi_possivel_salvar_a_foto"),
      );
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

    if (intent === "registro") {
      const registroTipoValue = pendingRegistroTipo;
      setPendingRegistroTipo(null);
      await performRegistroUpload(shot, registroTipoValue);
    }
  };

  const handleAbsence = async () => {
    if (!canAbsence || busy || isPhotoBusy || !isAbsenceNoteValid) return;
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

  const handleRetryGeoCapture = () => {
    const pending = pendingGeoAction;
    if (!pending) return;
    geo.resetError();
    setPendingGeoAction(null);
    if (pending.intent === "check_in") {
      void performCheckIn(pending.shot);
      return;
    }
    void performCheckOut({
      oportunidades: pending.oportunidades,
      notes: pending.notes,
      receiverName: pending.receiverName,
      receiverContact: pending.receiverContact,
      clientThermometer: pending.clientThermometer,
    });
  };

  const handleSkipGeoCapture = () => {
    const pending = pendingGeoAction;
    geo.resetError();
    if (!pending) {
      setGeoIntent(null);
      return;
    }
    setPendingGeoAction(null);
    if (pending.intent === "check_in") {
      void finalizeCheckIn({ shot: pending.shot, position: null });
      return;
    }
    void finalizeCheckOut({
      position: null,
      oportunidades: pending.oportunidades,
      notes: pending.notes,
      receiverName: pending.receiverName,
      receiverContact: pending.receiverContact,
      clientThermometer: pending.clientThermometer,
    });
  };

  const handleOpenAbsence = () => {
    if (!canAbsence || busy || isPhotoBusy) return;
    setIsAbsenceOpen(true);
  };

  const handleCloseAbsence = () => {
    if (isPhotoBusy) return;
    setIsAbsenceOpen(false);
  };

  const snapshotLabel = appointment.addressSnapshot ?? null;

  const oportunidades = appointment.oportunidades ?? [];
  const showOportunidades = Boolean(
    appointment.checkOutAt ||
    appointment.status === "done" ||
    appointment.status === "atuado",
  );
  const showRegistrosRealizados = registrosRealizados.length > 0;
  const cancellationReason = appointment.absenceNote?.trim() ?? "";
  const showCancellationReason =
    appointment.status === "absent" && cancellationReason.length > 0;
  const checkoutNotes = appointment.notes?.trim() ?? "";
  const showCheckoutNotes = checkoutNotes.length > 0;
  const creationNotes = appointment.creationNotes?.trim() ?? "";
  const showCreationNotes = creationNotes.length > 0;
  const hasThermometer = appointment.clientThermometer != null;
  const thermometerValue = appointment.clientThermometer ?? 0;
  const atuacaoResultadoRaw = atuacao?.resultado?.trim() ?? "";
  const atuacaoResultadoLabel = atuacaoResultadoRaw
    ? (atuacaoResultadoLabels[atuacaoResultadoRaw] ?? atuacaoResultadoRaw)
    : "";
  const showAtuacaoResultado = atuacaoResultadoRaw.length > 0;
  const atuacaoObservacao = atuacao?.observacao?.trim() ?? "";
  const showAtuacaoObservacao = atuacaoObservacao.length > 0;
  const showAtuacaoSection = showAtuacaoResultado || showAtuacaoObservacao;
  const atuacaoNfOuOs = atuacao?.nf_ou_os?.trim() ?? "";
  const showAtuacaoNfOuOs = atuacaoNfOuOs.length > 0;
  const atuacaoValor = atuacao?.valor ?? null;
  const showAtuacaoValor = typeof atuacaoValor === "number";
  const atuacaoMotivoPerda = atuacao?.motivo_perda?.trim() ?? "";
  const atuacaoMotivoPerdaLabel = atuacaoMotivoPerda
    ? ((t(`ui.lossReasons.${atuacaoMotivoPerda}`) as string) ??
      atuacaoMotivoPerda)
    : "";
  const showAtuacaoMotivoPerda = atuacaoMotivoPerda.length > 0;
  const selectedContact =
    contactOptions.find((contact) => contact.id === selectedContactId) ?? null;
  const shouldPersistContact = (() => {
    const normalizedName = receiverName.trim();
    const normalizedContact = receiverContact.trim();
    if (!normalizedName || !normalizedContact) return false;
    if (!selectedContact) return true;
    return (
      normalizedName !== selectedContact.name ||
      normalizedContact !== selectedContact.contact
    );
  })();
  const isCheckoutReceiverValid =
    receiverName.trim().length > 0 && receiverContact.trim().length > 0;
  const thermometerLabel = t("ui.termometro_nota_value", {
    value: clientThermometer,
  });
  const hasMapPoints = mapPoints.length > 0;
  const hasFilteredMapPoints = filteredMapPoints.length > 0;
  const companyDisplayName =
    company?.name ?? appointment.companyName ?? t("ui.empresa");
  const pendingRegistroCount = pendingPhotos.filter(
    (item) => item.kind === "registro",
  ).length;
  const registroCount =
    pendingRegistroCount +
    mediaItems.filter((item) => item.kind === "registro").length;
  const checkInTimeLabel = appointment.checkInAt
    ? formatTime(new Date(appointment.checkInAt))
    : t("ui.nao_realizado");
  const checkOutTimeLabel = appointment.checkOutAt
    ? formatTime(new Date(appointment.checkOutAt))
    : t("ui.nao_realizado");
  const canCheckInOut = canCheckIn || canCheckOut;
  const checkInOutLabel =
    isCheckInCapturing || isCheckOutCapturing
      ? t("ui.capturando_localizacao")
      : canCheckIn
        ? t("ui.fazer_check_in")
        : canCheckOut
          ? t("ui.fazer_check_out")
          : t("ui.check_in_check_out");
  const hasGeoFailure = Boolean(geo.error && pendingGeoAction);
  const geoModalTitle = geo.isCapturing
    ? t("ui.capturando_localizacao")
    : t("ui.nao_foi_possivel_capturar_a_localizacao");
  const geoModalSubtitle = geo.isCapturing
    ? t("ui.capturando_localizacao_aguarde_alguns_segundos")
    : geo.error?.code === "PERMISSION_DENIED"
      ? t("ui.permita_localizacao_no_navegador_para_concluir_o_registro")
      : t("ui.voce_pode_tentar_novamente_ou_continuar_sem_localizacao");
  const pendingItemBase = pendingPhotos.length + pendingActionCount;
  const pendingItemCount =
    pendingItemBase +
    (appointment.pendingSync && pendingItemBase === 0 ? 1 : 0);
  const dashboardVisitUrl = `${DASHBOARD_APPOINTMENT_BASE_URL}/${appointment.id}`;
  const whatsappShareMessage = `${t("ui.confira_essa_visita_que_fiz")}\n${dashboardVisitUrl}`;

  const cameraTitle =
    cameraIntent === "checkin"
      ? t("ui.foto_do_check_in")
      : cameraIntent === "registro"
        ? t("ui.adicionar_registro")
        : t("ui.capturar_foto");
  const canConfirmRegistroModal = Boolean(registroTipo) && !isPhotoBusy;
  const canAddPhoto = showAddPhoto;
  const inlineActionCols = "grid-cols-3";
  const checkInBlockReasons =
    (appointment.status ?? "scheduled") === "scheduled" && !canCheckIn
      ? [
          ...(blocked
            ? [t("ui.check_in_bloqueado_apontamento_em_execucao")]
            : []),
          ...(hasEarlierScheduled
            ? [t("ui.check_in_bloqueado_apontamento_anterior_agendado")]
            : []),
        ]
      : [];
  let pendingRegistroIndex = 0;
  let uploadedRegistroIndex = pendingRegistroCount;

  return (
    <AppShell
      title={t("ui.detalhe_do_agendamento")}
      subtitle={getAppointmentTitle(appointment)}
    >
      <div className="space-y-4">
        {syncStatus ? (
          <div className="w-full rounded-none border border-border bg-surface-muted px-3 py-1 text-[11px] text-foreground-soft">
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
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface-muted px-3 py-2">
              <div>
                <p className="text-[11px] font-semibold text-foreground-soft">
                  {t("ui.check_in")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {checkInTimeLabel}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-foreground-soft">
                  {t("ui.check_out")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {checkOutTimeLabel}
                </p>
              </div>
            </div>
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
            {hasThermometer ? (
              <div className="flex items-center justify-between">
                <span>{t("ui.termometro_do_cliente")}</span>
                <span className="font-semibold text-foreground">
                  {t("ui.termometro_nota_value", {
                    value: thermometerValue,
                  })}
                </span>
              </div>
            ) : null}
          </div>

          {/* {blocked ? (
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
          ) : null} */}
        </section>

        {/* <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
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
        </section> */}

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

        {showRegistrosRealizados ? (
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader title={t("ui.atividades_realizadas")} />
            <div className="flex flex-wrap gap-2">
              {registrosRealizados.map((item) => (
                <span
                  key={item.value}
                  className="rounded-full border border-border bg-surface-muted px-3 py-1 text-[11px] font-semibold text-foreground"
                >
                  {item.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {showCancellationReason ? (
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader title={t("ui.motivo_do_cancelamento")} />
            <p className="text-sm text-foreground-muted whitespace-pre-wrap">
              {cancellationReason}
            </p>
          </section>
        ) : null}

        {showAtuacaoSection ? (
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader title={t("ui.atuacao")} />
            <div className="space-y-2 text-sm text-foreground-muted">
              {showAtuacaoResultado ? (
                <div className="flex items-center justify-between">
                  <span>{t("ui.resultado_da_atuacao")}</span>
                  <span className="font-semibold text-foreground">
                    {atuacaoResultadoLabel}
                  </span>
                </div>
              ) : null}
              {showAtuacaoNfOuOs ? (
                <div className="flex items-center justify-between">
                  <span>{t("ui.nf_ou_os")}</span>
                  <span className="font-semibold text-foreground">
                    {atuacaoNfOuOs}
                  </span>
                </div>
              ) : null}
              {showAtuacaoValor ? (
                <div className="flex items-center justify-between">
                  <span>{t("ui.valor")}</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrencyBRL(atuacaoValor)}
                  </span>
                </div>
              ) : null}
              {showAtuacaoMotivoPerda ? (
                <div>
                  <p className="text-[11px] font-semibold text-foreground-soft">
                    {t("ui.motivo_perda")}
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted whitespace-pre-wrap">
                    {atuacaoMotivoPerdaLabel}
                  </p>
                </div>
              ) : null}
              {showAtuacaoObservacao ? (
                <div>
                  <p className="text-[11px] font-semibold text-foreground-soft">
                    {t("ui.observacao_da_atuacao")}
                  </p>
                  <p className="mt-1 text-sm text-foreground-muted whitespace-pre-wrap">
                    {atuacaoObservacao}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {showCreationNotes ? (
          <section className="space-y-3 rounded-3xl border border-warning/80 bg-amber-100 p-4 shadow-sm ring-1 ring-warning/30">
            <SectionHeader title={t("ui.nota_do_gestor")} />
            <p className="text-sm text-foreground-muted whitespace-pre-wrap">
              {creationNotes}
            </p>
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
          <div className="grid gap-2">
            {checkInBlockReasons.length > 0 ? (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                {checkInBlockReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              disabled={
                !canCheckInOut || busy || geo.isCapturing || isPhotoBusy
              }
              onClick={handleCheckInOut}
              className={`rounded-2xl px-4 py-4 text-base font-semibold transition ${
                canCheckInOut && !busy && !geo.isCapturing && !isPhotoBusy
                  ? canCheckIn
                    ? "bg-success text-white"
                    : "bg-info text-white"
                  : "cursor-not-allowed bg-surface-muted text-foreground-muted"
              }`}
            >
              {checkInOutLabel}
            </button>
            <div className={`grid gap-2 ${inlineActionCols}`}>
              {showAddPhoto ? (
                <button
                  type="button"
                  onClick={handleAddRegistroPhoto}
                  disabled={
                    !canAddPhoto ||
                    isPhotoBusy ||
                    registroCount >= MAX_REGISTROS
                  }
                  className={`min-h-[56px] rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight whitespace-normal break-words transition ${
                    canAddPhoto && !isPhotoBusy && registroCount < MAX_REGISTROS
                      ? "bg-accent text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {t("ui.adicionar_registro")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSyncAppointment}
                disabled={isSyncing || pendingItemCount === 0}
                className={`min-h-[56px] rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight whitespace-normal break-words transition ${
                  isSyncing || pendingItemCount === 0
                    ? "cursor-not-allowed bg-surface-muted text-foreground-muted"
                    : "bg-accent text-white"
                }`}
              >
                {isSyncing
                  ? t("ui.sincronizando_apontamento")
                  : t("ui.sincronizar_visita")}
              </button>
              {showAbsenceButton ? (
                <button
                  type="button"
                  disabled={!canAbsence || busy || isPhotoBusy}
                  onClick={handleOpenAbsence}
                  className={`min-h-[56px] rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight whitespace-normal break-words transition ${
                    canAbsence && !busy && !isPhotoBusy
                      ? "bg-danger text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {t("ui.justificar_ausencia")}
                </button>
              ) : null}
              {showEditVisit ? (
                <button
                  type="button"
                  onClick={handleEditVisit}
                  disabled={!canEditVisit || busy}
                  className={`min-h-[56px] rounded-2xl px-2 py-3 text-center text-xs font-semibold leading-tight whitespace-normal break-words transition ${
                    canEditVisit && !busy
                      ? "bg-foreground text-white"
                      : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {t("ui.editar_visita")}
                </button>
              ) : null}
              {showShareVisit ? (
                <button
                  type="button"
                  onClick={handleOpenShareModal}
                  className="min-h-[56px] rounded-2xl bg-foreground px-2 py-3 text-center text-xs font-semibold leading-tight whitespace-normal break-words text-white transition"
                >
                  {t("ui.compartilhar_visita")}
                </button>
              ) : null}
            </div>
            {/* {geo.isCapturing ? (
              <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                {t("ui.capturando_localizacao_aguarde_alguns_segundos")}
              </div>
            ) : null} */}
            {photoStatus ? (
              <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                {photoStatus}
              </div>
            ) : null}
          </div>
        </section>
        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <div
            className="rounded-2xl border border-border bg-surface-muted p-1"
            role="tablist"
            aria-label={t("ui.alternar_visualizacao")}
          >
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: "fotos", label: t("ui.fotos") },
                  { id: "mapa", label: t("ui.mapa") },
                  { id: "recursos", label: t("ui.recursos") },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={detailsTab === item.id}
                  onClick={() => setDetailsTab(item.id)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    detailsTab === item.id
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground-soft hover:bg-white/60"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {detailsTab === "fotos" ? (
            <div className="space-y-3">
              <SectionHeader
                title={t("ui.fotos")}
                subtitle={t("ui.registro_visual_do_apontamento")}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-foreground-soft">
                  {t("ui.registros_count", {
                    count: registroCount,
                    max: MAX_REGISTROS,
                  })}
                </div>
              </div>
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
                  const isRegistro = item.kind === "registro";
                  const isImage = isImageMime(item.mime);
                  const pendingFileName = item.originalName ?? null;
                  const kindLabel = isRegistro
                    ? (() => {
                        pendingRegistroIndex += 1;
                        return buildRegistroItemLabel(
                          pendingRegistroIndex,
                          item.registroTipo,
                        );
                      })()
                    : (item.kind &&
                        (mediaKindLabels as Record<string, string>)[
                          item.kind
                        ]) ||
                      t("ui.registro");
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-border bg-white"
                    >
                      {item.previewUrl && isImage ? (
                        <img
                          src={item.previewUrl}
                          alt={t("ui.foto_pendente_kind", { kind: kindLabel })}
                          className="h-28 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-28 flex-col items-center justify-center gap-1 px-2 text-[10px] text-foreground-soft">
                          <span className="text-[11px] font-semibold text-foreground text-center break-words">
                            {pendingFileName ?? t("ui.arquivo")}
                          </span>
                          <span>{t("ui.sem_preview")}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-foreground">
                        <span>{kindLabel}</span>
                        <span className="text-warning">{t("ui.pendente")}</span>
                      </div>
                    </div>
                  );
                })}
                {mediaItems.map((item) => {
                  const isRegistro = item.kind === "registro";
                  const isImage = isImageMime(item.mimeType);
                  const kindLabel = isRegistro
                    ? (() => {
                        uploadedRegistroIndex += 1;
                        return buildRegistroItemLabel(
                          uploadedRegistroIndex,
                          item.registroTipo,
                        );
                      })()
                    : mediaKindLabels[item.kind];
                  return (
                    <div
                      key={item.path}
                      className="overflow-hidden rounded-2xl border border-border bg-white"
                    >
                      {item.signedUrl ? (
                        isImage ? (
                          <img
                            src={item.signedUrl}
                            alt={t("ui.foto_kind", {
                              kind: kindLabel,
                            })}
                            className="h-28 w-full object-cover"
                          />
                        ) : (
                          <a
                            href={item.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-28 flex-col items-center justify-center gap-1 px-2 text-[10px] text-foreground-soft"
                          >
                            <span className="text-[11px] font-semibold text-foreground text-center break-words">
                              {item.fileName ?? t("ui.arquivo")}
                            </span>
                          </a>
                        )
                      ) : (
                        <div className="flex h-28 items-center justify-center text-[10px] text-foreground-soft">
                          {t("ui.url_expirada")}
                        </div>
                      )}
                      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-foreground">
                        <span>{kindLabel}</span>
                        <span className="text-success">{t("ui.enviado")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {detailsTab === "mapa" ? (
            <div className="space-y-3">
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
            </div>
          ) : null}

          {detailsTab === "recursos" ? (
            <div className="space-y-3">
              <SectionHeader
                title={t("ui.recursos")}
                subtitle={t("ui.geolocalizacao_registrada")}
              />
              <div className="space-y-3 text-xs text-foreground-muted">
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
            </div>
          ) : null}
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
                {checkoutStep === "summary"
                  ? t("ui.check_out_do_agendamento")
                  : t("ui.dados_de_recebimento")}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {checkoutStep === "summary"
                  ? t("ui.confirme_os_dados_antes_de_finalizar")
                  : t("ui.informe_quem_recebeu_a_visita")}
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

              {checkoutStep === "summary" ? (
                <>
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
                              <span className="font-semibold">
                                {option.label}
                              </span>
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
                      placeholder={t(
                        "ui.ex_cliente_solicitou_retorno_em_15_dias",
                      )}
                      className="mt-3 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                      rows={3}
                      disabled={isCheckoutBusy}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-border bg-white p-3">
                    <p className="text-xs font-semibold text-foreground">
                      {t("ui.quem_recebeu_a_visita")}
                    </p>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-2 text-xs font-semibold text-foreground">
                        <span>{t("ui.contatos_disponiveis")}</span>
                        <select
                          value={selectedContactId}
                          onChange={(event) =>
                            handleSelectContact(event.target.value)
                          }
                          disabled={isCheckoutBusy || contactsLoading}
                          className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                        >
                          <option value="">
                            {t("ui.selecione_um_contato")}
                          </option>
                          {contactOptions.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.name} - {contact.contact}
                            </option>
                          ))}
                          {/* <option value={NEW_CONTACT_ID}>
                            {t("ui.novo_contato")}
                          </option> */}
                        </select>
                        {contactsLoading ? (
                          <span className="text-[11px] text-foreground-muted">
                            {t("ui.carregando_contatos")}
                          </span>
                        ) : contactOptions.length === 0 ? (
                          <span className="text-[11px] text-foreground-muted">
                            {t("ui.nenhum_contato_disponivel")}
                          </span>
                        ) : null}
                        {contactsError ? (
                          <span className="text-[11px] text-warning">
                            {contactsError}
                          </span>
                        ) : null}
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-foreground">
                        <span>{t("ui.nome")}</span>
                        <input
                          type="text"
                          value={receiverName}
                          onChange={(event) => {
                            setReceiverName(event.target.value);
                            if (
                              selectedContactId &&
                              selectedContactId !== NEW_CONTACT_ID
                            ) {
                              setSelectedContactId(NEW_CONTACT_ID);
                            }
                          }}
                          placeholder={t("ui.ex_nome_de_quem_recebeu")}
                          className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                          disabled={isCheckoutBusy}
                        />
                      </label>
                      <label className="grid gap-2 text-xs font-semibold text-foreground">
                        <span>{t("ui.contato")}</span>
                        <input
                          type="text"
                          value={receiverContact}
                          onChange={(event) => {
                            setReceiverContact(event.target.value);
                            if (
                              selectedContactId &&
                              selectedContactId !== NEW_CONTACT_ID
                            ) {
                              setSelectedContactId(NEW_CONTACT_ID);
                            }
                          }}
                          placeholder={t("ui.ex_telefone_ou_email")}
                          className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                          disabled={isCheckoutBusy}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-white p-3">
                    <p className="text-xs font-semibold text-foreground">
                      {t("ui.termometro_do_cliente")}
                    </p>
                    <p className="mt-1 text-[11px] text-foreground-muted">
                      {t("ui.avaliacao_de_0_a_10")}
                    </p>
                    <div className="mt-3 space-y-2">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={clientThermometer}
                        onChange={(event) =>
                          setClientThermometer(Number(event.target.value))
                        }
                        disabled={isCheckoutBusy}
                        className="w-full accent-accent"
                      />
                      <div className="text-xs font-semibold text-foreground">
                        {thermometerLabel}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {photoStatus ? (
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
                  {photoStatus}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              {checkoutStep === "summary" ? (
                <>
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
                    onClick={handleContinueCheckout}
                    disabled={!canCheckOut || busy || isCheckoutBusy}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      canCheckOut && !busy && !isCheckoutBusy
                        ? "bg-info text-white"
                        : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {t("ui.continuar_check_out")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCheckoutStep("summary")}
                    disabled={isCheckoutBusy}
                    className={`rounded-full border border-border px-4 py-2 text-xs font-semibold ${
                      isCheckoutBusy
                        ? "cursor-not-allowed text-foreground-muted"
                        : "text-foreground-soft"
                    }`}
                  >
                    {t("ui.voltar")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipCheckoutContact}
                    disabled={isCheckoutBusy}
                    className={`rounded-full border border-border px-4 py-2 text-xs font-semibold ${
                      isCheckoutBusy
                        ? "cursor-not-allowed text-foreground-muted"
                        : "text-foreground-soft"
                    }`}
                  >
                    {t("ui.pular_contato")}
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeCheckout}
                    disabled={
                      !canCheckOut ||
                      busy ||
                      isCheckoutBusy ||
                      !isCheckoutReceiverValid
                    }
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      canCheckOut &&
                      !busy &&
                      !isCheckoutBusy &&
                      isCheckoutReceiverValid
                        ? "bg-info text-white"
                        : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {t("ui.finalizar_check_out")}
                  </button>
                </>
              )}
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
                  {t("ui.motivo_do_cancelamento")}
                </p>
                <textarea
                  value={absenceNote}
                  onChange={(event) => setAbsenceNote(event.target.value)}
                  placeholder={t("ui.descreva_o_motivo")}
                  className="mt-3 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                  rows={3}
                  required
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
                disabled={
                  !canAbsence || busy || isPhotoBusy || !isAbsenceNoteValid
                }
                onClick={handleAbsence}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  canAbsence && !busy && !isPhotoBusy && isAbsenceNoteValid
                    ? "bg-danger text-white"
                    : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                }`}
              >
                {t("ui.confirmar")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isRegistroModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
          onClick={handleCloseRegistroModal}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {t("ui.adicionar_registro")}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("ui.selecione_o_tipo_de_registro")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-2xl border border-border bg-white p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t("ui.tipo_de_registro")}
                </p>
                <div className="mt-3 max-h-48 overflow-y-auto pr-1">
                  <div className="grid gap-2">
                    {registroOptions.map((option) => {
                      const fieldId = `registro-${option.value}`;
                      return (
                        <label
                          key={option.value}
                          htmlFor={fieldId}
                          className="flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground"
                        >
                          <input
                            id={fieldId}
                            type="radio"
                            name="registro-tipo"
                            checked={registroTipo === option.value}
                            onChange={() => setRegistroTipo(option.value)}
                            disabled={isPhotoBusy}
                            className="h-4 w-4 accent-accent"
                          />
                          <span className="font-semibold">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCloseRegistroModal}
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
                onClick={() => handleConfirmRegistroModal("camera")}
                disabled={!canConfirmRegistroModal}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  canConfirmRegistroModal
                    ? "bg-info text-white"
                    : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                }`}
              >
                {t("ui.tirar_foto")}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmRegistroModal("file")}
                disabled={!canConfirmRegistroModal}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  canConfirmRegistroModal
                    ? "bg-info text-white"
                    : "cursor-not-allowed bg-surface-muted text-foreground-muted"
                }`}
              >
                {t("ui.adicionar_arquivo")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isShareModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center"
          onClick={handleCloseShareModal}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {t("ui.compartilhar_visita")}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {t("ui.selecione_o_destino_do_compartilhamento")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-full bg-info px-3 py-2 text-xs font-semibold text-white"
                >
                  {t("ui.pecas")}
                </button>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-full bg-surface-muted px-3 py-2 text-xs font-semibold text-foreground-muted"
                >
                  {t("ui.servicos")}
                </button>
              </div>

              <div className="space-y-2 rounded-2xl border border-border bg-surface-muted p-3">
                <p className="text-xs font-semibold text-foreground">
                  {t("ui.consultores_de_pecas")}
                </p>
                <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                  {partsConsultants.map((consultant) => {
                    const consultantName = t(consultant.nameKey);
                    const alreadyShared = Boolean(
                      appointment.sharedWith?.includes(consultantName),
                    );
                    return (
                      <button
                        key={consultant.phone}
                        type="button"
                        onClick={() =>
                          void handleShareWithConsultant(
                            consultantName,
                            consultant.phone,
                          )
                        }
                        className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                      >
                        <span>{consultantName}</span>
                        {alreadyShared ? (
                          <span className="rounded-full bg-success/15 px-2 py-1 text-[10px] font-semibold text-success">
                            {t("ui.enviado")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={handleCloseShareModal}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
              >
                {t("ui.fechar")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isGeoModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 py-6 sm:items-center">
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                {geoModalTitle}
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                {geoModalSubtitle}
              </p>
            </div>
            {hasGeoFailure ? (
              <div className="space-y-3 px-5 py-4">
                <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                  <p className="font-semibold text-foreground">
                    {geo.error?.message}
                  </p>
                </div>
              </div>
            ) : null}
            {hasGeoFailure ? (
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <button
                  type="button"
                  onClick={handleSkipGeoCapture}
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
                >
                  {t("ui.continuar_sem_localizacao")}
                </button>
                <button
                  type="button"
                  onClick={handleRetryGeoCapture}
                  className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-white"
                >
                  {t("ui.tentar_novamente")}
                </button>
              </div>
            ) : null}
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
      <input
        ref={registroFileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES_INPUT}
        multiple
        onChange={handleRegistroFileChange}
        className="hidden"
      />
    </AppShell>
  );
}
