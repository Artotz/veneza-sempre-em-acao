import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { signOut } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "./lib/firebase";
import cscIcon from "./assets/csc_logo.png";
import logoJd from "./assets/logo_jd.png";
import venezaEquip from "./assets/veneza_equip.png";
import backgroundImage from "./assets/background.png";
import { useAuth } from "./contexts/AuthContext";
import { useMaintenanceContext } from "./contexts/AppDataContext";
import { useExportEssentialPieces } from "./hooks/useExportEssentialPieces";
import { useMachineSelection } from "./hooks/useMachineSelection";
import { Header } from "./components/Header";
import {
  PdfPreviewModal,
  type PdfPreviewPayload,
} from "./components/PdfPreviewModal";
import { FilterSelect } from "./components/FilterSelect";
import { formatSellerName } from "./utils/formatSellerName";
import {
  familyLabels,
  familyOrder,
  findFamilyForModel,
  modelSuffix,
} from "./utils/machines";
import {
  findModelFromChassis,
  getChassisModelSegment,
  getModelSegment,
  validateChassis,
} from "./utils/validateChassis";
import { BRANCH_KEYS, clampBranchIndex } from "./utils/branches";
import type { Item, LaborValue } from "./types/maintenance";

const PREMIUM_PLAN_KEY = "filters.planTypes.premium" as const;
const ESSENTIAL_PLAN_KEY = "filters.planTypes.essential" as const;
const planTypeOptions = [PREMIUM_PLAN_KEY, ESSENTIAL_PLAN_KEY] as const;
const PREMIUM_PLAN_ENABLED = true; // Toggle to re-enable the premium plan option
const enabledPlanTypeOptions: Array<(typeof planTypeOptions)[number]> =
  PREMIUM_PLAN_ENABLED ? [...planTypeOptions] : [ESSENTIAL_PLAN_KEY];

const BASE_PAYMENT_CONDITION_OPTIONS = [
  "filters.payments.upfront",
  "filters.payments.x1",
  "filters.payments.x2",
  "filters.payments.x3",
] as const;
const ADMIN_PAYMENT_CONDITION_OPTIONS = [
  ...BASE_PAYMENT_CONDITION_OPTIONS,
  "filters.payments.x4",
  "filters.payments.x5",
  "filters.payments.x6",
] as const;

const partsDiscountOptions = ["0%", "5%", "10%", "15%", "20%", "25%"] as const;

const laborDiscountOptions = partsDiscountOptions;

const discountPercentByOption: Record<
  (typeof partsDiscountOptions)[number],
  number
> = {
  "0%": 0,
  "5%": 0.05,
  "10%": 0.1,
  "15%": 0.15,
  "20%": 0.2,
  "25%": 0.25,
};

const SERVICE_TYPE_EXTERNAL = "filters.serviceTypes.external" as const;
const SERVICE_TYPE_INTERNAL = "filters.serviceTypes.internal" as const;
const SERVICE_TYPE_JD = "filters.serviceTypes.jd" as const;
const BASE_SERVICE_TYPE_OPTIONS = [
  SERVICE_TYPE_EXTERNAL,
  SERVICE_TYPE_INTERNAL,
] as const;
const ADMIN_SERVICE_TYPE_OPTIONS = [
  ...BASE_SERVICE_TYPE_OPTIONS,
  SERVICE_TYPE_JD,
] as const;

const kmValueOptions = [5.4, 4.8] as const;
const INTERNAL_LABOR_RATE_FROM = 420;
const INTERNAL_LABOR_RATE_TO = 350;

const CSV_HEADERS = [
  "Número de Peça",
  "Qtd.",
  "Descrição",
  "Observações",
  "Dlr Pkg Qty",
  "Core Return Credit",
  "PIN",
  "Comentário 1",
  "Comentário 2",
] as const;

const escapeCsvValue = (value: string | number | null | undefined) => {
  const safe = value ?? "";
  return `"${String(safe).replace(/"/g, '""')}"`;
};
const normalizePdfFilename = (value: string) => value.replace(/\s+/g, "_");

export default function App() {
  const { user, branches, isAdmin } = useAuth();
  const { data, loading, error, lastUpdated, isOnline, syncing, retrySync } =
    useMaintenanceContext();
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(
    () => data?.hours?.[0] ?? null,
  );
  const [selectedEndHour, setSelectedEndHour] = useState<number | null>(
    () => data?.hours?.[0] ?? null,
  );
  const [listOpen, setListOpen] = useState<boolean>(false);
  const [preview, setPreview] = useState<PdfPreviewPayload | null>(null);
  const { t, i18n: i18nextInstance } = useTranslation();
  const locale = useMemo(
    () => (i18nextInstance.language === "pt" ? "pt-BR" : "en-US"),
    [i18nextInstance.language],
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "BRL",
      }),
    [locale],
  );
  const fmt = useCallback(
    (n?: number | null) => {
      if (n == null || Number.isNaN(n)) return "-";
      return currencyFormatter.format(n);
    },
    [currencyFormatter],
  );
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [locale],
  );

  const {
    selectedFamily,
    selectedModel,
    setSelectedFamily,
    setSelectedModel,
    machinesBySelectedFamily,
  } = useMachineSelection(data?.machines ?? []);

  useEffect(() => {
    if (!data) return;
    const initialHour = data.hours[0] ?? null;
    setSelectedStartHour((value) => (value != null ? value : initialHour));
    setSelectedEndHour((value) => (value != null ? value : initialHour));
  }, [data]);

  const [branchIndex, setBranchIndex] = useState<number>(0);
  const [planTypeIndex, setPlanTypeIndex] = useState<number>(0);
  const [paymentConditionIndex, setPaymentConditionIndex] = useState<number>(0);
  const [partsDiscountIndex, setPartsDiscountIndex] = useState<number>(0);
  const [laborDiscountIndex, setLaborDiscountIndex] = useState<number>(0);
  const [serviceTypeIndex, setServiceTypeIndex] = useState<number>(0);
  const [travelKm, setTravelKm] = useState<number>(0);
  const [kmValue, setKmValue] = useState<number>(kmValueOptions[0] ?? 0);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerChassis, setCustomerChassis] = useState<string>("");
  const availableBranches = useMemo(
    () => (branches.length ? branches : BRANCH_KEYS),
    [branches],
  );
  useEffect(() => {
    setBranchIndex((prev) => clampBranchIndex(prev, availableBranches));
  }, [availableBranches]);
  const branchKey =
    availableBranches[branchIndex] ?? availableBranches[0] ?? BRANCH_KEYS[0];
  const serviceTypeOptions = useMemo(
    () =>
      isAdmin
        ? [...ADMIN_SERVICE_TYPE_OPTIONS]
        : [...BASE_SERVICE_TYPE_OPTIONS],
    [isAdmin],
  );
  const paymentConditionOptions = useMemo(
    () =>
      isAdmin
        ? [...ADMIN_PAYMENT_CONDITION_OPTIONS]
        : [...BASE_PAYMENT_CONDITION_OPTIONS],
    [isAdmin],
  );
  useEffect(() => {
    setPaymentConditionIndex((prev) =>
      Math.min(Math.max(prev, 0), paymentConditionOptions.length - 1),
    );
  }, [paymentConditionOptions.length]);
  useEffect(() => {
    setServiceTypeIndex((prev) =>
      Math.min(Math.max(prev, 0), serviceTypeOptions.length - 1),
    );
  }, [serviceTypeOptions.length]);
  const planTypeKey =
    enabledPlanTypeOptions[planTypeIndex] ??
    enabledPlanTypeOptions[0] ??
    ESSENTIAL_PLAN_KEY;
  const paymentConditionKey =
    paymentConditionOptions[paymentConditionIndex] ??
    paymentConditionOptions[0];
  const partsDiscountKey =
    partsDiscountOptions[partsDiscountIndex] ?? partsDiscountOptions[0];
  const laborDiscountKey =
    laborDiscountOptions[laborDiscountIndex] ?? laborDiscountOptions[0];
  const serviceTypeKey =
    serviceTypeOptions[serviceTypeIndex] ?? serviceTypeOptions[0];
  const isEssentialPlan = planTypeKey === ESSENTIAL_PLAN_KEY;
  const isInternalService = serviceTypeKey === SERVICE_TYPE_INTERNAL;
  const isJohnDeereService = serviceTypeKey === SERVICE_TYPE_JD;
  const discountsLocked = isInternalService;
  const laborDisabled = isEssentialPlan || isInternalService;

  useEffect(() => {
    if (isInternalService) {
      setPartsDiscountIndex(0);
      setLaborDiscountIndex(0);
    }
  }, [isInternalService]);
  const branch = t(branchKey);
  const partsDiscountPercent = discountsLocked
    ? 0
    : (discountPercentByOption[partsDiscountKey] ?? 0);
  const laborDiscountPercent = laborDisabled
    ? 0
    : (discountPercentByOption[laborDiscountKey] ?? 0);
  // const serviceType = t(serviceTypeKey);
  const hasHourRange = selectedStartHour != null && selectedEndHour != null;
  const rangeStart = hasHourRange
    ? Math.min(selectedStartHour, selectedEndHour)
    : null;
  const rangeEnd = hasHourRange
    ? Math.max(selectedStartHour, selectedEndHour)
    : null;
  const hourRangeLabel =
    rangeStart != null && rangeEnd != null
      ? `${
          String(rangeStart)
          // quebra a linha pfv
        }h - ${String(rangeEnd)}h`
      : t("common.notProvided");

  const handleStartHourChange = (value: number) => {
    setSelectedStartHour(value);
    if (selectedEndHour != null && value > selectedEndHour) {
      setSelectedEndHour(value);
    }
  };

  const handleEndHourChange = (value: number) => {
    setSelectedEndHour(value);
    if (selectedStartHour != null && value < selectedStartHour) {
      setSelectedStartHour(value);
    }
  };

  const getItemQuantity = useCallback((item: Item) => {
    const raw =
      (item as Record<string, unknown>)?.quantidade ??
      (item as Record<string, unknown>)?.qtd ??
      item.quantidade ??
      1;
    const parsed = Number(raw);
    const baseQty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

    // TODO: Remover quando o backend enviar a quantidade correta de óleo.
    // Se a descrição tiver algo como "20LT", tratamos como 20 litros para multiplicar o total.
    const description =
      typeof item.descricao === "string" ? item.descricao : "";
    const litersMatch = description.match(/(\d+)\s*LT/i);
    if (litersMatch) {
      const liters = Number(litersMatch[1]);
      if (Number.isFinite(liters) && liters > 0) {
        return baseQty * liters;
      }
    }

    return baseQty;
  }, []);
  const getItemPrice = useCallback(
    (item: Item) => {
      const normalizeUnit = (value: unknown) => {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const branchPrices = item.branchPrices ?? {};
      const branchPriceEntry =
        branchPrices[branch] ?? Object.values(branchPrices)[0];

      const resolveServicePrice = () => {
        if (isJohnDeereService) {
          const jdPrice = normalizeUnit(branchPriceEntry?.jd);
          if (jdPrice != null) return jdPrice;
        }

        if (isInternalService) {
          return normalizeUnit(branchPriceEntry?.precoInterno); // ??
          // normalizeUnit(item.precos?.precoInterno) ??
          // normalizeUnit(item.precos?.custo) ??
          // normalizeUnit(item.precos?.over)
        }

        return normalizeUnit(branchPriceEntry?.precoExterno); // ??
        // normalizeUnit(item.precos?.precoExterno) ??
        // normalizeUnit(item.precos?.preco_publico) ??
        // normalizeUnit(item.precos?.over)
      };

      const unitPrice = resolveServicePrice();

      const quantity = getItemQuantity(item);

      const safeUnit = unitPrice ?? 0;
      const safeQuantity = quantity > 0 ? quantity : 1;
      return safeUnit * safeQuantity;
    },
    [branch, getItemQuantity, isInternalService, isJohnDeereService],
  );

  const getLaborBaseValue = useCallback(
    (entry: LaborValue) => {
      const normalizeNumber = (value: unknown) => {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const hourly = normalizeNumber(entry.valor_mo);
      const hours = normalizeNumber(entry.horas_base);
      const total = normalizeNumber(entry.total_mo);

      const shouldOverrideInternalRate =
        isInternalService && hourly === INTERNAL_LABOR_RATE_FROM;

      if (shouldOverrideInternalRate) {
        // TEMP FIX: enquanto o backend nao entrega a M.O. interna correta,
        // forcamos as revisoes que vierem com 420/h para 350/h em atendimentos internos.
        const adjustedHourly = INTERNAL_LABOR_RATE_TO;
        if (hours != null) {
          return adjustedHourly * hours;
        }
        if (total != null) {
          return (total * adjustedHourly) / INTERNAL_LABOR_RATE_FROM;
        }
        return adjustedHourly;
      }

      if (hours != null && hourly != null) {
        return hourly * hours;
      }
      if (total != null) return total;
      if (hourly != null) return hourly;
      return 0;
    },
    [isInternalService],
  );

  function handleExportPDF() {
    if (!data) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });
    const pad = 4;

    doc.setFontSize(14);
    doc.text(t("pdf.listTitle"), pad, 20);
    doc.setFontSize(10);
    doc.text(`${t("pdf.model")}: ${selectedModel}`, pad, 50);
    doc.text(`${t("pdf.hours")}: ${hourRangeLabel}`, pad + 180, 50);
    doc.text(`${t("pdf.branch")}: ${branch}`, pad + 300, 50);

    const head = [
      [
        t("list.headers.revision"),
        t("list.headers.code"),
        t("list.headers.quantity"),
        t("list.headers.description"),
        t("list.headers.over"),
      ],
    ];
    const body = (filtered || []).map((it) => [
      `${String(it.hour)}h`,
      it.codigo,
      getItemQuantity(it),
      it.descricao,
      fmt(getItemPrice(it)),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 70,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [17, 24, 39] },
      columnStyles: { 5: { cellWidth: 160 } },
      margin: 4,
    });

    const totalPartsLabel = formatTotalWithDiscount(
      totalPartsBase,
      partsDiscountPercent,
    );
    doc.setFontSize(10);
    const y = (doc as any).lastAutoTable?.finalY ?? 80;
    doc.text(
      t("common.listTotalSingle", { value: totalPartsLabel }),
      pad,
      y + 24,
    );

    const startLabel = rangeStart != null ? String(rangeStart) : "--";
    const endLabel = rangeEnd != null ? String(rangeEnd) : "--";
    const file = normalizePdfFilename(
      `${t("pdf.listFilePrefix")}_${modelSuffix(
        selectedModel,
      )}_${startLabel}h-${endLabel}h.pdf`,
    );
    doc.save(file);
  }

  const filtered = useMemo(() => {
    if (!data || !selectedModel || rangeStart == null || rangeEnd == null)
      return [];
    return data.items
      .filter(
        (it) =>
          it.modelo === selectedModel &&
          it.hour >= rangeStart &&
          it.hour <= rangeEnd,
      )
      .sort((a, b) => a.hour - b.hour || a.codigo.localeCompare(b.codigo));
  }, [data, selectedModel, rangeEnd, rangeStart]);

  const handleExportCSV = useCallback(() => {
    if (!filtered.length) return;

    const grouped = new Map<
      string,
      { codigo: string; descricao: string; quantidade: number }
    >();

    for (const item of filtered) {
      // Protheus: agrupar referencias iguais mesmo que venham de revisoes diferentes.
      const code = item.codigo ?? "SEM-CODIGO";
      const previous = grouped.get(code);
      const quantity = getItemQuantity(item);
      if (previous) {
        previous.quantidade += quantity;
        if (!previous.descricao && item.descricao) {
          previous.descricao = item.descricao;
        }
        continue;
      }
      grouped.set(code, {
        codigo: code,
        descricao: item.descricao ?? "",
        quantidade: quantity,
      });
    }

    const headerRow = CSV_HEADERS.map(escapeCsvValue).join(",");
    const dataRows = Array.from(grouped.values()).map((row) =>
      [row.codigo, row.quantidade, row.descricao, "", "", "", "", "", ""]
        .map(escapeCsvValue)
        .join(","),
    );

    const csvContent = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const startLabel = rangeStart != null ? `${rangeStart}h` : "inicio";
    const endLabel = rangeEnd != null ? `${rangeEnd}h` : "fim";
    link.href = URL.createObjectURL(blob);
    link.download = `jdp_lista_${modelSuffix(
      selectedModel,
    )}_${startLabel}-${endLabel}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [filtered, getItemQuantity, rangeEnd, rangeStart, selectedModel]);

  const totalPartsBase = useMemo(
    () => filtered.reduce((s, it) => s + getItemPrice(it), 0),
    [filtered, getItemPrice],
  );

  const laborEntries = useMemo(() => {
    if (!data || !selectedModel || rangeStart == null || rangeEnd == null)
      return [];
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    return (data.labor ?? []).filter(
      (entry) =>
        entry.modelo === selectedModel &&
        entry.horas_revisao >= start &&
        entry.horas_revisao <= end,
    );
  }, [data, rangeEnd, rangeStart, selectedModel]);

  const totalLaborBase = useMemo(
    () =>
      laborEntries.reduce((sum, entry) => sum + getLaborBaseValue(entry), 0),
    [getLaborBaseValue, laborEntries],
  );

  const totalLaborHours = useMemo(() => {
    const normalizeNumber = (value: unknown) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return laborEntries.reduce((sum, entry) => {
      const hours = normalizeNumber(entry.horas_base);
      if (hours != null) return sum + hours;

      const hourly = normalizeNumber(entry.valor_mo);
      const total = normalizeNumber(entry.total_mo);
      if (hourly != null && hourly > 0 && total != null) {
        return sum + total / hourly;
      }
      return sum;
    }, 0);
  }, [laborEntries]);

  const laborHourlyValue = useMemo(() => {
    const normalizeNumber = (value: unknown) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    for (const entry of laborEntries) {
      const hourly = normalizeNumber(entry.valor_mo);
      const shouldOverrideInternalRate =
        isInternalService && hourly === INTERNAL_LABOR_RATE_FROM;
      if (hourly != null) {
        return shouldOverrideInternalRate ? INTERNAL_LABOR_RATE_TO : hourly;
      }

      const hours = normalizeNumber(entry.horas_base);
      const total = normalizeNumber(entry.total_mo);
      if (total != null && hours != null && hours > 0) {
        return total / hours;
      }
    }

    if (totalLaborHours > 0 && totalLaborBase > 0) {
      return totalLaborBase / totalLaborHours;
    }

    return null;
  }, [isInternalService, laborEntries, totalLaborBase, totalLaborHours]);

  const laborHoursLabel = useMemo(() => {
    if (totalLaborHours <= 0) return null;
    const hoursFormatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: totalLaborHours % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    return hoursFormatter.format(totalLaborHours);
  }, [locale, totalLaborHours]);

  const safeTravelKm = isEssentialPlan
    ? 0
    : Number.isFinite(travelKm)
      ? Math.max(travelKm, 0)
      : 0;
  const safeKmValue = isEssentialPlan
    ? 0
    : Number.isFinite(kmValue)
      ? Math.max(kmValue, 0)
      : 0;

  const selectedRevisionsCount = useMemo(() => {
    if (!data?.hours?.length) return 0;
    const start = rangeStart ?? data.hours[0];
    const end = rangeEnd ?? data.hours[data.hours.length - 1];
    const startHour = Math.min(start, end);
    const endHour = Math.max(start, end);
    return data.hours.filter((hour) => hour >= startHour && hour <= endHour)
      .length;
  }, [data, rangeEnd, rangeStart]);

  const travelCostPerRevision = safeTravelKm * safeKmValue;
  const travelCost =
    isEssentialPlan || selectedRevisionsCount === 0
      ? 0
      : travelCostPerRevision * selectedRevisionsCount;
  const laborBaseWithPlan = isEssentialPlan ? 0 : totalLaborBase;

  const formatTotalWithDiscount = useCallback(
    (base: number, discount: number, extra: number = 0) => {
      const baseTotal = base + extra;
      const discounted = base * (1 - discount) + extra;
      if (baseTotal === 0 || discount <= 0 || baseTotal === discounted)
        return fmt(baseTotal);
      return `${fmt(baseTotal)} >> ${fmt(discounted)}`;
    },
    [fmt],
  );

  const laborTotalDiscounted =
    laborBaseWithPlan * (1 - laborDiscountPercent) + travelCost;
  const totalLaborWithTravel = laborBaseWithPlan + travelCost;

  const totalFinalBase = totalPartsBase + totalLaborWithTravel;
  const totalFinalDiscounted =
    totalPartsBase * (1 - partsDiscountPercent) + laborTotalDiscounted;

  const cycleStartHour = useMemo(() => {
    if (rangeStart != null) return rangeStart;
    if (data?.hours?.length) return data.hours[0];
    return 0;
  }, [data, rangeStart]);

  const cycleEndHour = useMemo(() => {
    if (rangeEnd != null) return rangeEnd;
    if (data?.hours?.length) return data.hours[data.hours.length - 1];
    return cycleStartHour;
  }, [cycleStartHour, data, rangeEnd]);

  const revisionPrices = useMemo(() => {
    if (!data) return [];
    const start = Math.min(cycleStartHour, cycleEndHour);
    const end = Math.max(cycleStartHour, cycleEndHour);
    const totals = new Map<number, number>();
    const hoursInRange = (data.hours ?? []).filter(
      (h) => h >= start && h <= end,
    );
    for (const hour of hoursInRange) {
      totals.set(hour, 0);
    }

    for (const item of data.items) {
      if (item.modelo !== selectedModel) continue;
      if (item.hour < start || item.hour > end) continue;
      const current = totals.get(item.hour) ?? 0;
      const discounted = getItemPrice(item) * (1 - partsDiscountPercent);
      totals.set(item.hour, current + discounted);
    }

    return Array.from(totals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, total]) => ({ hour, total }));
  }, [
    cycleEndHour,
    cycleStartHour,
    data,
    getItemPrice,
    partsDiscountPercent,
    selectedModel,
  ]);

  const laborRevisionPrices = useMemo(() => {
    if (!data) return [];
    const start = Math.min(cycleStartHour, cycleEndHour);
    const end = Math.max(cycleStartHour, cycleEndHour);
    const totals = new Map<number, number>();
    const hoursInRange = (data.hours ?? []).filter(
      (h) => h >= start && h <= end,
    );
    for (const hour of hoursInRange) {
      totals.set(hour, 0);
    }
    for (const entry of data.labor ?? []) {
      if (entry.modelo !== selectedModel) continue;
      if (entry.horas_revisao < start || entry.horas_revisao > end) continue;
      const current = totals.get(entry.horas_revisao) ?? 0;
      const baseValue = isEssentialPlan ? 0 : getLaborBaseValue(entry);
      const discounted = baseValue * (1 - laborDiscountPercent);
      totals.set(entry.horas_revisao, current + discounted);
    }
    return Array.from(totals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, total]) => ({ hour, total }));
  }, [
    cycleEndHour,
    cycleStartHour,
    data,
    isEssentialPlan,
    getLaborBaseValue,
    laborDiscountPercent,
    selectedModel,
  ]);

  const sellerNameLabel = useMemo(
    () => formatSellerName(user?.email ?? null, t("common.notProvided")),
    [t, user?.email],
  );
  const isChassisInvalid = useMemo(
    () => validateChassis(selectedModel, customerChassis),
    [customerChassis, selectedModel],
  );

  useEffect(() => {
    const chassisSegment = getChassisModelSegment(customerChassis);
    if (!chassisSegment) return;
    const selectedSegment = getModelSegment(selectedModel);
    if (!selectedSegment || chassisSegment === selectedSegment) return;

    const machines = data?.machines ?? [];
    if (machines.length === 0) return;

    const matchedModel = findModelFromChassis(customerChassis, machines);
    if (!matchedModel || matchedModel === selectedModel) return;

    const matchedFamily = findFamilyForModel(machines, matchedModel);
    if (matchedFamily && matchedFamily !== selectedFamily) {
      setSelectedFamily(matchedFamily);
    }
    setSelectedModel(matchedModel);
  }, [
    customerChassis,
    data?.machines,
    selectedFamily,
    selectedModel,
    setSelectedFamily,
    setSelectedModel,
  ]);
  const navLinks = useMemo(
    () => [
      { to: "/", label: "Plano de Manutenção" },
      { to: "/garantia", label: "PowerGard" },
    ],
    [],
  );

  const handleExportEssentialPiecesPDF = useExportEssentialPieces({
    user,
    customerName,
    customerEmail: customerEmail || null,
    customerPhone: customerPhone || null,
    customerChassis: customerChassis || null,
    equipmentName:
      selectedFamily && selectedModel
        ? `${t(familyLabels[selectedFamily] ?? selectedFamily)} ${modelSuffix(
            selectedModel,
          )}`
        : modelSuffix(selectedModel) || t("common.notProvided"),
    selectedModel,
    modelSuffix,
    region: branch,
    sellerName: sellerNameLabel,
    planTypeLabel: t(planTypeKey),
    serviceTypeLabel: t(serviceTypeKey),
    paymentConditionLabel: t(paymentConditionKey),
    cycleStartHour,
    cycleEndHour,
    travelKm: safeTravelKm,
    kmValue: safeKmValue,
    travelCost,
    partsTotalBase: totalPartsBase,
    laborTotalBase: laborBaseWithPlan,
    totalFinalBase,
    totalFinalDiscounted,
    partsDiscountPercent,
    laborDiscountPercent,
    revisionPrices,
    laborRevisionPrices,
    fmtCurrency: fmt,
    t,
    locale,
  });

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdated) return null;
    return dateTimeFormatter.format(new Date(lastUpdated));
  }, [dateTimeFormatter, lastUpdated]);

  if (!user)
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground">
        {t("common.logging")}
      </main>
    );

  if (loading && !data)
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground">
        {t("common.loading")}
      </main>
    );

  if (!data)
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground px-6 text-center">
        <div className="space-y-3 max-w-lg">
          <p className="text-contrast">{error ?? t("messages.genericLoad")}</p>
        </div>
      </main>
    );

  return (
    <main
      className="relative min-h-screen max-h-screen min-h-[100svh] max-h-[100svh] w-screen overflow-y-auto overflow-x-hidden no-scrollbar bg-background text-foreground flex flex-col
             before:fixed before:inset-0 before:bg-black/50 before:z-0 before:pointer-events-none"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 mt-12 h-[90]">
        {preview && (
          <PdfPreviewModal
            blob={preview.blob}
            filename={preview.filename}
            onClose={() => setPreview(null)}
          />
        )}
        {!isOnline && (
          <div className="bg-accent border-b border-border text-contrast text-sm px-4 py-2 flex flex-wrap items-center gap-3">
            <span>{t("common.offline")}</span>
            {lastUpdateLabel && (
              <span className="text-foreground">
                {t("common.lastUpdate", { value: lastUpdateLabel })}
              </span>
            )}
            <button
              onClick={retrySync}
              className="rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-contrast hover:ring-2 hover:ring-accent disabled:opacity-60"
              disabled={syncing}
            >
              {syncing ? t("common.syncing") : t("common.tryGoOnline")}
            </button>
          </div>
        )}
        {error && (
          <div className="bg-accent border-b border-accent text-contrast text-sm px-4 py-2 text-center">
            {t("common.errorPrefix")}: {error}
          </div>
        )}
        <Header
          title={t("common.appName")}
          sellerName={sellerNameLabel}
          links={navLinks}
          signOutLabel={t("header.signOut")}
          onSignOut={() => signOut(auth)}
        />

        <section className="mx-auto max-w-7xl px-4 py-4 mb-12 flex-1 flex min-h-0 flex-col w-full">
          {/* Seletores de Familia, Modelo e Horas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div>
              <label className="block text-sm font-semibold text-label-text mb-1">
                {t("filters.family")}
              </label>
              <select
                className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
              >
                {familyOrder.map((fam) => (
                  <option key={fam} value={fam}>
                    {t(familyLabels[fam] ?? fam)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-label-text mb-1">
                {t("filters.model")}
              </label>
              <select
                className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {machinesBySelectedFamily.map((m) => (
                  <option key={m} value={m}>
                    {modelSuffix(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-label-text mb-1">
                {t("filters.startHour")}
              </label>
              <select
                className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                value={rangeStart ?? ""}
                onChange={(e) => {
                  if (e.target.value === "") return;
                  handleStartHourChange(Number(e.target.value));
                }}
              >
                {data.hours.map((h) => (
                  <option key={`start-${h}`} value={h}>
                    {h.toString()}h
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-label-text mb-1">
                {t("filters.endHour")}
              </label>
              <select
                className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                value={rangeEnd ?? ""}
                onChange={(e) => {
                  if (e.target.value === "") return;
                  handleEndHourChange(Number(e.target.value));
                }}
              >
                {data.hours.map((h) => (
                  <option key={`end-${h}`} value={h}>
                    {h.toString()}h
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dados do cliente */}
          <div className="mt-4">
            <span className="block text-sm font-semibold text-label-text mb-2">
              Dados do cliente
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-label-text mb-1">
                  Nome / Razão Social
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                  placeholder="Cliente"
                />
              </div>
              <div>
                <label className="block text-xs text-label-text mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                  placeholder="email@cliente.com"
                />
              </div>
              <div>
                <label className="block text-xs text-label-text mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2"
                  placeholder="(xx) xxxxx-xxxx"
                />
              </div>
              <div>
                <label className="block text-xs text-label-text mb-1">
                  Chassi
                </label>
                <input
                  type="text"
                  value={customerChassis}
                  onChange={(e) => setCustomerChassis(e.target.value)}
                  className={`w-full bg-surface-muted border rounded-xl px-3 py-2 ${
                    isChassisInvalid
                      ? "text-red-600 border-red-500"
                      : "border-border"
                  }`}
                  placeholder="Chassi"
                />
              </div>
            </div>
          </div>

          {/* Filtros */}

          {/* DESCONTOS NÃO ESTÃO FUNCIONANDO AINDA */}
          <div className="mt-12 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <FilterSelect
                label={t("filters.branch")}
                options={availableBranches}
                value={branchIndex}
                onChange={setBranchIndex}
                renderLabel={t}
              />
              <FilterSelect
                label={t("filters.serviceType")}
                options={serviceTypeOptions}
                value={serviceTypeIndex}
                onChange={setServiceTypeIndex}
                renderLabel={t}
              />
              <FilterSelect
                label={t("filters.planType")}
                options={enabledPlanTypeOptions}
                value={planTypeIndex}
                onChange={setPlanTypeIndex}
                renderLabel={t}
              />
              <FilterSelect
                label={t("filters.paymentCondition", "Condição de pagamento")}
                options={paymentConditionOptions}
                value={paymentConditionIndex}
                onChange={setPaymentConditionIndex}
                renderLabel={t}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <FilterSelect
                className={discountsLocked ? "opacity-60" : ""}
                label={t("filters.partsDiscount")}
                options={partsDiscountOptions}
                value={partsDiscountIndex}
                onChange={setPartsDiscountIndex}
                renderLabel={t}
                disabled={discountsLocked}
              />

              <FilterSelect
                className={laborDisabled ? "opacity-60" : ""}
                label={t("filters.laborDiscount")}
                options={laborDiscountOptions}
                value={laborDiscountIndex}
                onChange={setLaborDiscountIndex}
                renderLabel={t}
                disabled={laborDisabled}
              />
              <div className={isEssentialPlan ? "opacity-60" : ""}>
                <label className="block text-sm font-medium text-label-text mb-1">
                  Ida + Volta (Km)
                </label>
                <input
                  disabled={isEssentialPlan}
                  type="number"
                  min={0}
                  className="w-full bg-surface-muted text-foreground border border-border rounded-xl px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  value={Number.isFinite(travelKm) ? travelKm : 0}
                  onChange={(e) =>
                    setTravelKm(
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                  placeholder="0"
                />
              </div>
              <div className={isEssentialPlan ? "opacity-60" : ""}>
                <label className="block text-sm font-medium text-label-text mb-1">
                  Valor Km
                </label>
                <select
                  disabled={isEssentialPlan}
                  className="w-full bg-surface-muted text-foreground border border-border rounded-xl px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  value={kmValue}
                  onChange={(e) => setKmValue(Number(e.target.value))}
                >
                  {kmValueOptions.map((v) => (
                    <option key={v} value={v}>
                      {fmt(v)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <section className="mt-12">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <span className="block text-xs uppercase tracking-wide text-foreground">
                  {t("stats.partsTotal")}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {formatTotalWithDiscount(
                    totalPartsBase,
                    partsDiscountPercent,
                  )}
                </span>
              </div>

              <div
                className={`rounded-2xl border border-border bg-surface p-4 ${
                  isEssentialPlan ? "opacity-60" : ""
                }`}
                aria-disabled={isEssentialPlan}
              >
                <span className="block text-xs uppercase tracking-wide text-foreground">
                  Total M.O.
                  {laborHoursLabel && laborHourlyValue != null && (
                    <span className="ml-1 text-[11px] font-normal text-foreground/80 normal-case">
                      ({fmt(laborHourlyValue)} X {laborHoursLabel}h)
                    </span>
                  )}
                  {travelCostPerRevision > 0 && selectedRevisionsCount > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-foreground/80 normal-case">
                      + ({fmt(travelCostPerRevision)} X {selectedRevisionsCount}
                      )
                    </span>
                  )}
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {formatTotalWithDiscount(
                    laborBaseWithPlan,
                    laborDiscountPercent,
                    travelCost,
                  )}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4">
                <span className="block text-xs uppercase tracking-wide font-semibold text-foreground">
                  {t("stats.finalTotal")}
                </span>
                <span className="text-lg font-bold text-foreground">
                  {totalFinalBase === totalFinalDiscounted
                    ? fmt(totalFinalBase)
                    : `${fmt(totalFinalBase)} >> ${fmt(totalFinalDiscounted)}`}
                </span>
              </div>

              <button
                onClick={async () => {
                  const result = await handleExportEssentialPiecesPDF();
                  if (result) {
                    setPreview(result);
                  }
                }}
                className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted font-semibold  hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
              >
                {t("stats.generateDocument")}
              </button>
            </div>
          </section>

          {/* Container Lista */}
          <div className="flex mt-6 py-6 gap-6 items-stretch">
            {/* Lista de Itens */}
            <section className=" min-h-0 flex w-full max-h-[80vh]">
              <div className="rounded-2xl border w-full border-border bg-surface flex flex-col h-full min-h-0">
                {/* Cabeçalho */}
                <div className="px-4 py-3 border-b border-border shrink-0 flex justify-between flex-col sm:flex-row">
                  <div className="flex justify-between flex-col px-1">
                    <h2 className="text-base font-semibold tracking-tight">
                      {t("list.title")}
                    </h2>
                    <p className="text-sm text-foreground flex flex-row items-center gap-2">
                      <span>{selectedModel}</span>
                      <span className="hidden sm:inline" aria-hidden="true">
                        -
                      </span>
                      <span>{hourRangeLabel}</span>
                      <span className="hidden sm:inline" aria-hidden="true">
                        -
                      </span>
                      <span>{t("list.count", { count: filtered.length })}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex justify-between sm:justify-end gap-2">
                    <button
                      onClick={handleExportCSV}
                      className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
                    >
                      Exportar CSV
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
                    >
                      {t("list.export")}
                    </button>
                    <button
                      onClick={() => setListOpen((v) => !v)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
                      aria-expanded={listOpen}
                      aria-controls="lista-itens-conteudo"
                    >
                      {listOpen ? t("list.close") : t("list.open")}
                    </button>
                  </div>
                </div>

                <div
                  id="lista-itens-conteudo"
                  className="flex-1 min-h-0 overflow-scroll flex"
                  hidden={!listOpen}
                >
                  <table className="min-w-full text-[11px] sm:text-sm table-fixed">
                    <thead className="sticky top-0 bg-surface text-foreground shadow">
                      <tr className="border-b border-border text-left">
                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap w-20 sm:w-28 sticky left-0 bg-surface">
                          {t("list.headers.revision")}
                        </th>
                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap w-24 sm:w-32">
                          {t("list.headers.code")}
                        </th>
                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-right w-16 sm:w-20">
                          {t("list.headers.quantity")}
                        </th>
                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-normal break-words w-full max-w-[360px] sm:max-w-[520px]">
                          {t("list.headers.description")}
                        </th>
                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-right w-24 sm:w-28">
                          {t("list.headers.over")}
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((it, idx) => (
                        <tr
                          key={`${it.codigo}-${idx}`}
                          className="odd:bg-surface-muted even:bg-surface-muted/50 border-b border-border/40"
                        >
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap w-20 sm:w-28">
                            {String(it.hour)}h
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap w-24 sm:w-32">
                            {it.codigo}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right whitespace-nowrap w-16 sm:w-20">
                            {getItemQuantity(it)}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 w-full max-w-[360px] sm:max-w-[520px] whitespace-normal break-words">
                            {it.descricao}
                          </td>
                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right whitespace-nowrap w-24 sm:w-28">
                            {fmt(getItemPrice(it))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé fixo */}
                <div
                  className="border-t border-border bg-surface px-3 py-3 shrink-0 rounded-b-2xl"
                  // hidden={!listOpen}
                >
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t("common.totalLabel")}</span>
                    <span className="text-right">
                      {t("common.tableTotalSingle", {
                        value: formatTotalWithDiscount(
                          totalPartsBase,
                          partsDiscountPercent,
                        ),
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <div className="mt-3 px-4 pb-3 flex flex-row items-center w-full justify-between ">
          <div className="px-4 flex flex-row justify-end">
            <img src={cscIcon} alt="CSC" className="h-12 w-auto drop-shadow" />
          </div>
          <div className="px-4 flex flex-row justify-end">
            <img
              src={venezaEquip}
              alt="Veneza Equipamentos"
              className="h-8 w-auto drop-shadow"
            />
            <div className="bg-white h-fit">
              <img src={logoJd} alt="John Deere" className="h-8 w-auto" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
