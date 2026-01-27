import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "../lib/firebase";
import cscIcon from "../assets/csc_logo.png";
import logoJd from "../assets/logo_jd.png";
import venezaEquip from "../assets/veneza_equip.png";
import backgroundImage from "../assets/background.png";
import { useAuth } from "../contexts/AuthContext";
import { useWarrantyContext } from "../contexts/AppDataContext";
import { useExportEssentialPieces as useExportExtendedWarranty } from "../hooks/useExportExtendedWarranty";
import { useMachineSelection } from "../hooks/useMachineSelection";
import { Header } from "../components/Header";
import {
  PdfPreviewModal,
  type PdfPreviewPayload,
} from "../components/PdfPreviewModal";
import { FilterSelect } from "../components/FilterSelect";
import { formatSellerName } from "../utils/formatSellerName";
import {
  familyLabels,
  familyOrder,
  findFamilyForModel,
  modelSuffix,
} from "../utils/machines";
import {
  findModelFromChassis,
  getChassisModelSegment,
  getModelSegment,
  validateChassis,
} from "../utils/validateChassis";
import {
  APPLICATION_KEYS,
  MODALITY_KEYS,
  WARRANTY_HOURS,
  WARRANTY_MONTHS,
} from "../hooks/useWarrantyData";
import { BRANCH_KEYS, clampBranchIndex } from "../utils/branches";
import type { WarrantyMatrix } from "../types/warranty";

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

// (UI labels) — removidos: Governamental / Compreensivo
const applicationOptions = [
  "Comercial",
  "Aluguel",
  "Severo",
  "Governamental",
] as const;
const modalityOptions = [
  "Trem de força",
  "Trem de força + Hidráulico",
  "Compreensivo",
] as const;
const discountOptions = [0, 0.05, 0.1, 0.15] as const;
const warrantyTypeOptions = ["Ativação", "Renovação"] as const;

// Regras internas de precificacao da garantia (nao exibir na UI).
// 1) aplicar imposto de 15% antes de qualquer markup
// 2) aplicar markup de 100% (dobra o valor) depois do imposto
const WARRANTY_TAX_RATE = 0.15; // 15%

const applyWarrantyCharges = (baseValue: number | null, markupRate: number) => {
  if (baseValue == null) return null;

  // 1) aplicar imposto de 15% “brutando” como na planilha: C8 / (1 - G6)
  const withTax = baseValue / (1 - WARRANTY_TAX_RATE);

  // 2) aplicar markup de 100% (dobra o valor): C9 * (1 + H6)
  const finalValue = withTax * (1 + markupRate);

  return finalValue;
};

const applyDiscount = (value: number | null, discountPercent: number) => {
  if (value == null) return null;
  const safeDiscount = Math.min(Math.max(discountPercent, 0), 0.15);
  return value * (1 - safeDiscount);
};

type CoverageSelection = {
  row: number;
  col: number;
};

export default function GarantiaPage() {
  const { user, branches, isAdmin } = useAuth();
  const { data, loading, error, lastUpdated, isOnline, syncing, retrySync } =
    useWarrantyContext();

  const [preview, setPreview] = useState<PdfPreviewPayload | null>(null);
  const { t, i18n: i18nextInstance } = useTranslation();

  const locale = useMemo(
    () => (i18nextInstance.language === "pt" ? "pt-BR" : "en-US"),
    [i18nextInstance.language]
  );

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }),
    [locale]
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      }),
    [locale]
  );

  const {
    selectedFamily,
    selectedModel,
    setSelectedFamily,
    setSelectedModel,
    machinesBySelectedFamily,
  } = useMachineSelection(data?.machines ?? []);

  const [branchIndex, setBranchIndex] = useState<number>(0);

  const paymentConditionOptions = useMemo(
    () =>
      isAdmin
        ? [...ADMIN_PAYMENT_CONDITION_OPTIONS]
        : [...BASE_PAYMENT_CONDITION_OPTIONS],
    [isAdmin]
  );

  const [paymentConditionIndex, setPaymentConditionIndex] = useState<number>(0);
  useEffect(() => {
    setPaymentConditionIndex((prev) =>
      Math.min(Math.max(prev, 0), paymentConditionOptions.length - 1)
    );
  }, [paymentConditionOptions.length]);

  const [applicationIndex, setApplicationIndex] = useState<number>(0);
  const [modalityIndex, setModalityIndex] = useState<number>(0);
  const [marginIndex, setMarginIndex] = useState<number>(0);
  const [discountIndex, setDiscountIndex] = useState<number>(0);
  const [warrantyTypeIndex, setWarrantyTypeIndex] = useState<number>(0);
  const [costOverrideInput, setCostOverrideInput] = useState<string>("");

  useEffect(() => {
    setWarrantyTypeIndex((prev) =>
      isAdmin ? Math.min(Math.max(prev, 0), warrantyTypeOptions.length - 1) : 0
    );
  }, [isAdmin]);

  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerChassis, setCustomerChassis] = useState<string>("");

  const [selectedCoverage, setSelectedCoverage] =
    useState<CoverageSelection | null>(null);

  const [listOpen, setListOpen] = useState<boolean>(false);

  const availableBranches = useMemo(
    () => (branches.length ? branches : BRANCH_KEYS),
    [branches]
  );

  useEffect(() => {
    setBranchIndex((prev) => clampBranchIndex(prev, availableBranches));
  }, [availableBranches]);

  const branchKey =
    availableBranches[branchIndex] ?? availableBranches[0] ?? BRANCH_KEYS[0];

  const paymentConditionKey =
    paymentConditionOptions[paymentConditionIndex] ??
    paymentConditionOptions[0];

  const branch = t(branchKey);

  const marginOptions = useMemo(
    () =>
      isAdmin
        ? Array.from({ length: 21 }, (_, i) =>
            Number((1 - i * 0.05).toFixed(2))
          )
        : [1],
    [isAdmin]
  );

  useEffect(() => {
    if (marginIndex >= marginOptions.length) setMarginIndex(0);
  }, [marginIndex, marginOptions.length]);

  const selectedMarginRate = marginOptions[marginIndex] ?? marginOptions[0];

  const selectedUsageKey =
    APPLICATION_KEYS[applicationIndex] ?? APPLICATION_KEYS[0];

  const selectedModalityKey = MODALITY_KEYS[modalityIndex] ?? MODALITY_KEYS[0];

  const selectedDiscountPercent =
    discountOptions[discountIndex] ?? discountOptions[0];
  const warrantyTypeLabel =
    warrantyTypeOptions[warrantyTypeIndex] ?? warrantyTypeOptions[0];
  const isWarrantyRenewal = warrantyTypeIndex === 1;

  useEffect(() => {
    if (!isWarrantyRenewal) setCostOverrideInput("");
  }, [isWarrantyRenewal]);

  const parsedCostOverride = useMemo(() => {
    if (!isWarrantyRenewal) return null;
    const raw = costOverrideInput.trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed)) return null;
    return Math.max(parsed, 0);
  }, [costOverrideInput, isWarrantyRenewal]);

  const hasCostOverride = parsedCostOverride != null;
  const overrideBaseValue =
    parsedCostOverride != null
      ? applyWarrantyCharges(parsedCostOverride, selectedMarginRate)
      : null;
  const overrideFinalValue =
    overrideBaseValue != null
      ? applyDiscount(overrideBaseValue, selectedDiscountPercent)
      : null;

  const discountSelectOptions = useMemo(
    () => discountOptions.map((opt) => `${Math.round(opt * 100)}%`),
    []
  );

  const modelKeyForSelection = useMemo(() => selectedModel, [selectedModel]);

  const selectedMatrix: WarrantyMatrix = useMemo(
    () =>
      data && modelKeyForSelection
        ? data.models[modelKeyForSelection]?.[selectedUsageKey]?.[
            selectedModalityKey
          ] ?? []
        : [],
    [data, modelKeyForSelection, selectedModalityKey, selectedUsageKey]
  );

  const pricedMatrix: WarrantyMatrix = useMemo(
    () =>
      selectedMatrix.map((row) =>
        row.map((value) => applyWarrantyCharges(value, selectedMarginRate))
      ),
    [selectedMarginRate, selectedMatrix]
  );

  const discountedMatrix: WarrantyMatrix = useMemo(
    () =>
      pricedMatrix.map((row) =>
        row.map((value) => applyDiscount(value, selectedDiscountPercent))
      ),
    [pricedMatrix, selectedDiscountPercent]
  );

  const monthOptions = useMemo(() => {
    if (!selectedMatrix || selectedMatrix.length === 0) return [];
    const maxColumns = selectedMatrix.reduce((acc, row) => {
      let lastIdx = -1;
      for (let idx = row.length - 1; idx >= 0; idx -= 1) {
        if (row[idx] != null) {
          lastIdx = idx;
          break;
        }
      }
      return Math.max(acc, lastIdx + 1);
    }, 0);

    const safeLength = Math.min(
      WARRANTY_MONTHS.length,
      Math.max(0, maxColumns)
    );
    return WARRANTY_MONTHS.slice(0, safeLength);
  }, [selectedMatrix]);

  const columnWidth = `${100 / ((monthOptions.length || 1) + 1)}%`;

  const hourLabelForRow = useCallback((rowIndex: number) => {
    if (rowIndex < WARRANTY_HOURS.length) return WARRANTY_HOURS[rowIndex];
    const last = WARRANTY_HOURS[WARRANTY_HOURS.length - 1];
    const extra = rowIndex - WARRANTY_HOURS.length + 1;
    return last + extra * 500;
  }, []);

  useEffect(() => {
    setSelectedCoverage((prev) => {
      if (!selectedMatrix || selectedMatrix.length === 0) return null;

      if (prev && selectedMatrix[prev.row]?.[prev.col] != null) return prev;

      for (let r = 0; r < selectedMatrix.length; r += 1) {
        for (let c = 0; c < monthOptions.length; c += 1) {
          if (selectedMatrix[r]?.[c] != null) return { row: r, col: c };
        }
      }
      return null;
    });
  }, [monthOptions.length, selectedMatrix]);

  const selectedCoverageValue =
    selectedCoverage &&
    discountedMatrix[selectedCoverage.row]?.[selectedCoverage.col] != null
      ? discountedMatrix[selectedCoverage.row]?.[selectedCoverage.col]
      : null;

  const selectedCoverageValueBase =
    selectedCoverage &&
    pricedMatrix[selectedCoverage.row]?.[selectedCoverage.col] != null
      ? pricedMatrix[selectedCoverage.row]?.[selectedCoverage.col]
      : null;

  const selectedCoverageCostValue =
    selectedCoverage &&
    selectedMatrix[selectedCoverage.row]?.[selectedCoverage.col] != null
      ? selectedMatrix[selectedCoverage.row]?.[selectedCoverage.col]
      : null;

  const maxMonthValue = useMemo(
    () =>
      monthOptions.reduce((max, val) => {
        const safe = typeof val === "number" ? val : Number(val);
        return Number.isFinite(safe) ? Math.max(max, safe) : max;
      }, 0),
    [monthOptions]
  );

  const maxHourValue = useMemo(() => {
    const hours = discountedMatrix
      .map((_, idx) => hourLabelForRow(idx))
      .filter((h): h is number => Number.isFinite(h ?? NaN));
    if (!hours.length) return null;
    return Math.max(...hours);
  }, [discountedMatrix, hourLabelForRow]);

  const selectedCoverageHours = selectedCoverage
    ? hourLabelForRow(selectedCoverage.row)
    : null;

  const selectedCoverageMonths = selectedCoverage
    ? monthOptions[selectedCoverage.col] ?? null
    : null;

  const fallbackCoverage = useMemo(() => {
    if (!discountedMatrix || discountedMatrix.length === 0) return null;
    for (let r = 0; r < discountedMatrix.length; r += 1) {
      for (let c = 0; c < monthOptions.length; c += 1) {
        const val = discountedMatrix[r]?.[c];
        if (val != null) {
          return {
            value: val,
            baseValue: pricedMatrix?.[r]?.[c] ?? null,
            costValue: selectedMatrix?.[r]?.[c] ?? null,
            hours: hourLabelForRow(r),
            months: monthOptions[c],
          };
        }
      }
    }
    return null;
  }, [
    discountedMatrix,
    hourLabelForRow,
    monthOptions,
    pricedMatrix,
    selectedMatrix,
  ]);

  const resolvedCoverage = useMemo(
    () => ({
      value: hasCostOverride
        ? overrideFinalValue
        : selectedCoverageValue ?? fallbackCoverage?.value ?? null,
      baseValue: hasCostOverride
        ? overrideBaseValue
        : selectedCoverageValueBase ?? fallbackCoverage?.baseValue ?? null,
      costValue: hasCostOverride
        ? parsedCostOverride
        : selectedCoverageCostValue ?? fallbackCoverage?.costValue ?? null,
      hours: selectedCoverageHours ?? fallbackCoverage?.hours ?? null,
      months: selectedCoverageMonths ?? fallbackCoverage?.months ?? null,
    }),
    [
      fallbackCoverage,
      hasCostOverride,
      overrideBaseValue,
      overrideFinalValue,
      parsedCostOverride,
      selectedCoverageHours,
      selectedCoverageMonths,
      selectedCoverageCostValue,
      selectedCoverageValue,
      selectedCoverageValueBase,
    ]
  );

  const costInputValue = useMemo(() => {
    if (isWarrantyRenewal && costOverrideInput !== "") {
      return costOverrideInput;
    }
    if (resolvedCoverage.costValue == null) return "";
    return resolvedCoverage.costValue.toFixed(2);
  }, [costOverrideInput, isWarrantyRenewal, resolvedCoverage.costValue]);

  const coveragePriceLabel = useMemo(() => {
    const { value, baseValue } = resolvedCoverage;
    if (value == null && baseValue == null) return t("common.notProvided");
    if (value == null) return t("common.notProvided");
    if (baseValue != null && baseValue !== value) {
      return `${currencyFormatter.format(
        baseValue
      )} >> ${currencyFormatter.format(value)}`;
    }
    return currencyFormatter.format(value);
  }, [currencyFormatter, resolvedCoverage, t]);

  const maxMonthsLabel = useMemo(() => {
    if (maxMonthValue > 0) return `Até ${maxMonthValue} meses`;
    return t("common.notProvided");
  }, [maxMonthValue, t]);

  const maxHoursLabel = useMemo(() => {
    if (maxHourValue != null)
      return `Até ${maxHourValue.toLocaleString(locale)} horas`;
    return t("common.notProvided");
  }, [locale, maxHourValue, t]);

  const hoursOptions = useMemo(
    () =>
      discountedMatrix.map((_, idx) => {
        const label = hourLabelForRow(idx);
        return {
          row: idx,
          label: label
            ? `${label.toLocaleString(locale)} horas`
            : `Linha ${idx + 1}`,
        };
      }),
    [discountedMatrix, hourLabelForRow, locale]
  );

  const findRowForColumn = useCallback(
    (colIdx: number) => {
      for (let r = 0; r < pricedMatrix.length; r += 1) {
        if (pricedMatrix[r]?.[colIdx] != null) return r;
      }
      return null;
    },
    [pricedMatrix]
  );

  const findColumnForRow = useCallback(
    (rowIdx: number) => {
      const row = pricedMatrix[rowIdx] ?? [];
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] != null) return c;
      }
      return null;
    },
    [pricedMatrix]
  );

  const handleMonthSelect = useCallback(
    (colIdx: number) => {
      if (colIdx < 0 || colIdx >= monthOptions.length) {
        setSelectedCoverage(null);
        return;
      }
      const currentRow = selectedCoverage?.row;
      if (currentRow != null && pricedMatrix[currentRow]?.[colIdx] != null) {
        setSelectedCoverage({ row: currentRow, col: colIdx });
        return;
      }
      const rowFound = findRowForColumn(colIdx);
      if (rowFound != null) {
        setSelectedCoverage({ row: rowFound, col: colIdx });
        return;
      }
      setSelectedCoverage(null);
    },
    [findRowForColumn, monthOptions.length, pricedMatrix, selectedCoverage]
  );

  const handleHourSelect = useCallback(
    (rowIdx: number) => {
      const currentCol = selectedCoverage?.col;
      if (currentCol != null && pricedMatrix[rowIdx]?.[currentCol] != null) {
        setSelectedCoverage({ row: rowIdx, col: currentCol });
        return;
      }
      const colFound = findColumnForRow(rowIdx);
      if (colFound != null) {
        setSelectedCoverage({ row: rowIdx, col: colFound });
        return;
      }
      setSelectedCoverage(null);
    },
    [findColumnForRow, pricedMatrix, selectedCoverage]
  );

  const sellerNameLabel = useMemo(
    () => formatSellerName(user?.email ?? null, t("common.notProvided")),
    [t, user?.email]
  );

  const isChassisInvalid = useMemo(
    () => validateChassis(selectedModel, customerChassis),
    [customerChassis, selectedModel]
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
    []
  );

  const handleExportExtendedWarrantyPDF = useExportExtendedWarranty({
    user,
    customerName,
    customerEmail: customerEmail || null,
    customerPhone: customerPhone || null,
    customerChassis: customerChassis || null,
    equipmentName:
      selectedFamily && selectedModel
        ? `${t(familyLabels[selectedFamily] ?? selectedFamily)} ${modelSuffix(
            selectedModel
          )}`
        : modelSuffix(selectedModel) || t("common.notProvided"),
    selectedModel,
    modelSuffix,
    region: branch,
    sellerName: sellerNameLabel,
    paymentConditionLabel: t(paymentConditionKey),
    warrantyTypeLabel,
    t,
    locale,
    coverageApplicationLabel: applicationOptions[applicationIndex],
    coverageModalityLabel: modalityOptions[modalityIndex],
    coverageDurationMonths:
      selectedCoverageMonths ??
      fallbackCoverage?.months ??
      (discountedMatrix.length > 0 ? monthOptions[0] ?? null : null),
    coverageDurationHours:
      selectedCoverageHours ?? fallbackCoverage?.hours ?? null,
    coverageValue: resolvedCoverage.value,
    coverageValueBase: resolvedCoverage.baseValue,
    coverageDiscountPercent: selectedDiscountPercent,
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
          title={"PowerGard"}
          sellerName={sellerNameLabel}
          links={navLinks}
          signOutLabel={t("header.signOut")}
          onSignOut={() => signOut(auth)}
        />

        <section className="mx-auto max-w-7xl px-4 py-4 mb-12 flex-1 flex min-h-0 flex-col w-full">
          {/* Seletores de Familia, Modelo e aviso */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
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
                Tipo de Garantia
              </label>
              <select
                className="w-full bg-surface-muted border border-border rounded-xl px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                value={String(warrantyTypeIndex)}
                onChange={(e) => setWarrantyTypeIndex(Number(e.target.value))}
                disabled={!isAdmin}
              >
                {warrantyTypeOptions.map((opt, idx) => (
                  <option key={opt} value={idx}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex rounded-xl border border-border bg-surface p-2 mt-3 h-[65px] justify-center items-center">
                <p className="text-sm leading-relaxed text-foreground font-bold">
                  {`Em casos de RENOVAÇÃO, favor realizar a proposta com o CSC.`}
                </p>
              </div>
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

          {/* Filtros (agora com FilterSelect como no App) */}
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
                label={"Aplicação"}
                options={applicationOptions}
                value={applicationIndex}
                onChange={setApplicationIndex}
                renderLabel={(v) => v}
              />

              <FilterSelect
                label={"Modalidade"}
                options={modalityOptions}
                value={modalityIndex}
                onChange={setModalityIndex}
                renderLabel={(v) => v}
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
              <div>
                <label className="block text-sm font-medium text-label-text mb-1">
                  Meses
                </label>
                <select
                  className="w-full bg-surface-muted text-foreground border border-border rounded-xl px-3 py-2"
                  value={selectedCoverage ? String(selectedCoverage.col) : ""}
                  onChange={(e) => handleMonthSelect(Number(e.target.value))}
                >
                  {monthOptions.map((month, idx) => (
                    <option key={month} value={idx}>
                      {month} meses
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-label-text mb-1">
                  Horas
                </label>
                <select
                  className="w-full bg-surface-muted text-foreground border border-border rounded-xl px-3 py-2"
                  value={selectedCoverage ? String(selectedCoverage.row) : ""}
                  onChange={(e) => handleHourSelect(Number(e.target.value))}
                >
                  {hoursOptions.map((opt) => (
                    <option key={opt.row} value={opt.row}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <FilterSelect
                label="Desconto"
                options={discountSelectOptions}
                value={discountIndex}
                onChange={setDiscountIndex}
              />

              {isAdmin && (
                <div>
                  <FilterSelect
                    label={t("filters.margin", "Margem")}
                    options={marginOptions.map(
                      (opt) => `${Math.round(opt * 100)}%`
                    )}
                    value={marginIndex}
                    onChange={setMarginIndex}
                  />
                </div>
              )}
            </div>
          </div>

          <section className="mt-[49px]">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isAdmin ? (
                <div
                  className={`rounded-2xl border border-border bg-surface p-4 flex flex-col justify-center ${
                    hasCostOverride
                      ? "border-accent ring-1 ring-accent/40 bg-accent/10"
                      : ""
                  }`}
                >
                  <span className="block text-xs uppercase tracking-wide text-foreground">
                    Preço de Custo
                  </span>
                  <div className="flex items-center gap-2">
                    {isWarrantyRenewal ? (
                      <>
                        <span className="text-lg font-semibold text-foreground">
                          R$
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={costInputValue}
                          onChange={(e) => setCostOverrideInput(e.target.value)}
                          aria-label="Preco de Custo"
                          className={`h-7 w-full bg-transparent border rounded-lg px-2 py-0 text-lg font-semibold leading-tight text-foreground ${
                            hasCostOverride
                              ? "border-accent/70"
                              : "border-border"
                          }`}
                        />
                      </>
                    ) : (
                      <span className="text-lg font-semibold text-foreground">
                        {resolvedCoverage.costValue == null
                          ? t("common.notProvided")
                          : currencyFormatter.format(
                              resolvedCoverage.costValue
                            )}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="hidden sm:block rounded-2xl border border-border bg-surface p-4 invisible"
                  aria-hidden="true"
                >
                  <span className="block text-xs uppercase tracking-wide text-foreground">
                    Placeholder
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    --
                  </span>
                </div>
              )}

              <div
                className="hidden sm:block rounded-2xl border border-border bg-surface p-4 invisible"
                aria-hidden="true"
              >
                <span className="block text-xs uppercase tracking-wide text-foreground">
                  Placeholder
                </span>
                <span className="text-lg font-semibold text-foreground">
                  --
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col justify-center">
                <span className="block text-xs uppercase tracking-wide font-semibold text-foreground">
                  Preço final
                </span>
                <span className="text-lg font-bold text-foreground">
                  {coveragePriceLabel}
                </span>
              </div>

              <button
                onClick={async () => {
                  const result = await handleExportExtendedWarrantyPDF();
                  if (result) setPreview(result);
                }}
                className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted font-semibold hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm lg:col-span-1 flex items-center justify-center"
              >
                Visualizar Documento
              </button>
            </div>
          </section>

          <div className="flex mt-6 py-6 gap-6 items-stretch">
            <section className="min-h-0 flex w-full max-h-[80vh]">
              <div className="rounded-2xl border w-full border-border bg-surface flex flex-col h-full min-h-0">
                <div className="px-4 py-3 border-b border-border shrink-0 flex justify-between flex-col sm:flex-row">
                  <div className="flex justify-between flex-col px-1">
                    <h2 className="text-base font-semibold tracking-tight">
                      Lista de Preços
                    </h2>
                    <p className="text-sm text-foreground flex flex-row items-center gap-2">
                      <span>{selectedModel || t("common.notProvided")}</span>
                      <span className="hidden sm:inline" aria-hidden="true">
                        -
                      </span>
                      <span>{maxMonthsLabel}</span>
                      <span className="hidden sm:inline" aria-hidden="true">
                        -
                      </span>
                      <span>{maxHoursLabel}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setListOpen((v) => !v)}
                      className="rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface text-sm"
                      aria-expanded={listOpen}
                      aria-controls="lista-precos-conteudo"
                    >
                      {listOpen ? t("list.close") : t("list.open")}
                    </button>
                  </div>
                </div>

                <div
                  id="lista-precos-conteudo"
                  className="flex-1 min-h-0 overflow-scroll flex"
                  hidden={!listOpen}
                >
                  {discountedMatrix.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Nenhuma matriz cadastrada para esta combinação.
                    </div>
                  ) : (
                    <table className="min-w-full text-[11px] sm:text-sm table-fixed">
                      <thead className="sticky top-0 bg-surface text-foreground shadow">
                        <tr className="border-b border-border text-left">
                          <th
                            className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-left sticky left-0 bg-surface"
                            style={{ width: columnWidth }}
                          >
                            {`Horas /
                         Meses`}
                          </th>
                          {monthOptions.map((month) => (
                            <th
                              key={month}
                              className="px-2 sm:px-3 py-1.5 sm:py-2 text-center font-semibold whitespace-nowrap leading-tight"
                              style={{ width: columnWidth }}
                            >
                              {month} meses
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="text-[11px] sm:text-sm">
                        {discountedMatrix.map((row, rowIdx) => {
                          const hourValue = hourLabelForRow(rowIdx);
                          return (
                            <tr
                              key={rowIdx}
                              className="odd:bg-surface-muted even:bg-surface-muted/50 border-b border-border/40"
                            >
                              <td
                                className="px-2 sm:px-3 py-1.5 sm:py-2 font-semibold whitespace-nowrap sticky left-0 bg-surface"
                                style={{ width: columnWidth }}
                              >
                                {hourValue
                                  ? `${hourValue.toLocaleString(locale)} horas`
                                  : `Linha ${rowIdx + 1}`}
                              </td>

                              {monthOptions.map((_, colIdx) => {
                                const value = row[colIdx] ?? null;
                                const isDisabled = value == null;
                                const isChecked =
                                  selectedCoverage?.row === rowIdx &&
                                  selectedCoverage?.col === colIdx;

                                return (
                                  <td
                                    key={`${rowIdx}-${colIdx}`}
                                    className="px-2 sm:px-3 py-1.5 sm:py-2 text-center whitespace-nowrap"
                                    style={{ width: columnWidth }}
                                  >
                                    {isDisabled ? (
                                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                                        --
                                      </span>
                                    ) : (
                                      <label className="inline-flex items-center gap-1 sm:gap-2 cursor-pointer select-none">
                                        <input
                                          type="radio"
                                          name="warranty-matrix"
                                          className="h-3.5 w-3.5 sm:h-4 sm:w-4 accent-foreground"
                                          checked={isChecked}
                                          onChange={() => {
                                            if (costOverrideInput !== "") {
                                              setCostOverrideInput("");
                                            }
                                            setSelectedCoverage({
                                              row: rowIdx,
                                              col: colIdx,
                                            });
                                          }}
                                        />
                                        <span className="font-semibold leading-tight">
                                          {currencyFormatter.format(value)}
                                        </span>
                                      </label>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="border-t border-border bg-surface px-3 py-3 shrink-0 rounded-b-2xl">
                  <div className="flex justify-between text-sm font-medium text-transparent">
                    <span>placeholder</span>
                    <span>placeholder</span>
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
