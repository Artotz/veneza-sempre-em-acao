import { useCallback } from "react";
import { jsPDF } from "jspdf";
import type { TFunction } from "i18next";
import type { User } from "firebase/auth";
import logoJohnDeere from "../assets/logo_jd.png";
import logoVeneza from "../assets/logo_veneza.png";

const machineAssets = import.meta.glob("../assets/machines/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/**
 * Preços agregados por revisão, em horas.
 * Exemplo: [{ hour: 1000, total: 8185.23 }, { hour: 1500, total: 3286.81 }]
 */
export type RevisionPrice = {
  hour: number;
  total: number;
};

let cachedLogos: { veneza?: string; johnDeere?: string } = {};
let logosPromise: Promise<typeof cachedLogos> | null = null;
const machineImageCache: Record<string, string | null> = {};

const normalizePdfFilename = (value: string) => value.replace(/\s+/g, "_");

const normalizeMachineKey = (value: string) =>
  value
    .replace(/\([^)]*\)/g, "")
    .replace(/[-\s]+/g, "")
    .toUpperCase()
    .replace(/II$/, "");

const machineImageByKey = new Map<string, string>();
for (const [path, url] of Object.entries(machineAssets)) {
  const filename = path.split("/").pop() ?? path;
  const base = filename.replace(/\.png$/i, "");
  machineImageByKey.set(normalizeMachineKey(base), url as string);
}

const loadImageAsDataUrl = async (src: string) => {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

const loadMachineImage = async (modelId: string) => {
  const key = normalizeMachineKey(modelId);
  if (machineImageCache[key] !== undefined) {
    return machineImageCache[key];
  }
  const url = machineImageByKey.get(key);
  if (!url) {
    machineImageCache[key] = null;
    return null;
  }
  try {
    const dataUrl = await loadImageAsDataUrl(url);
    machineImageCache[key] = dataUrl;
    return dataUrl;
  } catch {
    machineImageCache[key] = null;
    return null;
  }
};

const loadLogos = async () => {
  if (!logosPromise) {
    logosPromise = Promise.all([
      cachedLogos.veneza ? cachedLogos.veneza : loadImageAsDataUrl(logoVeneza),
      cachedLogos.johnDeere
        ? cachedLogos.johnDeere
        : loadImageAsDataUrl(logoJohnDeere),
    ]).then(([veneza, johnDeere]) => {
      cachedLogos = { veneza, johnDeere };
      return cachedLogos;
    });
  }
  return logosPromise;
};

type UseExportEssentialPiecesParams = {
  user: User | null | undefined;

  // Cliente
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerChassis?: string | null;

  // Equipamento
  equipmentName: string; // ex: "Trator de Esteira 750J"
  selectedModel: string; // para sufixo/modelSuffix (mesma ideia do outro hook)
  modelSuffix: (machineId: string) => string;

  // Comercial / região
  region: string; // ex: "Nordeste"
  sellerName: string; // "Responsável pela venda"
  planTypeLabel: string; // Nome do plano (Essencial/Premium) para exibir no PDF
  serviceTypeLabel: string;
  paymentConditionLabel: string;

  // Ciclo de horas do contrato
  cycleStartHour: number; // ex: 1000
  cycleEndHour: number; // ex: 2500

  // Dados logísticos / descontos
  travelKm: number; // "Ida + Volta [Km]"
  kmValue: number; // "Valor Km"
  travelCost: number; // km * valor km (sem desconto)
  partsDiscountPercent: number; // se quiser mostrar (%)
  partsTotalBase: number;
  laborTotalBase: number;
  totalFinalBase: number;
  totalFinalDiscounted: number;
  laborDiscountPercent: number; // se quiser mostrar (%)

  // Preços por revisão (em horas), será usado nas caixas 500/500
  revisionPrices: RevisionPrice[];
  laborRevisionPrices: RevisionPrice[];

  // Formatação numérica
  fmtCurrency: (value?: number | null) => string;

  // Tradução / locale
  t: TFunction<"translation">;
  locale: string;
};

export function useExportEssentialPieces({
  // user,
  customerName,
  customerEmail,
  customerPhone,
  customerChassis,
  equipmentName,
  selectedModel,
  modelSuffix,
  region,
  sellerName,
  planTypeLabel,
  serviceTypeLabel,
  paymentConditionLabel,
  cycleStartHour,
  cycleEndHour,
  travelKm,
  kmValue,
  travelCost,
  partsDiscountPercent,
  partsTotalBase,
  laborTotalBase,
  totalFinalBase,
  totalFinalDiscounted,
  laborDiscountPercent,
  revisionPrices,
  laborRevisionPrices,
  fmtCurrency,
  t,
  locale,
}: UseExportEssentialPiecesParams) {
  return useCallback(async (): Promise<{
    blob: Blob;
    filename: string;
  } | null> => {
    // Segurança básica
    if (!selectedModel || !equipmentName) return null;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const M = 4; // margem externa reduzida
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const innerW = pageW - M * 2;

    const COLOR = {
      ink: [0, 0, 0] as [number, number, number],
      sub: [80, 80, 80] as [number, number, number],
      band: [255, 222, 0] as [number, number, number],
      border: [0, 0, 0] as [number, number, number],
      light: [240, 240, 240] as [number, number, number],
    };

    const dfmt = new Intl.DateTimeFormat(locale);
    const now = new Date();
    const validity = new Date(now);
    validity.setDate(validity.getDate() + 5); // validade: 5 dias

    const safeTravelKm = Number.isFinite(travelKm) ? Math.max(travelKm, 0) : 0;
    const safeKmValue = Number.isFinite(kmValue) ? Math.max(kmValue, 0) : 0;
    const safeTravelCost = Number.isFinite(travelCost)
      ? Math.max(travelCost, 0)
      : safeTravelKm * safeKmValue;

    const lh = (fs: number) => fs * 1.25;
    const addPageIfNeeded = (needed: number, y: number) => {
      if (y + needed > pageH - M) {
        doc.addPage();
        return M;
      }
      return y;
    };
    const addLogo = (
      dataUrl: string,
      x: number,
      yPos: number,
      boxW: number,
      boxH: number,
      fallback: string,
    ) => {
      try {
        const padding = 8;
        doc.addImage(
          dataUrl,
          "PNG",
          x + padding,
          yPos + padding,
          boxW - padding * 2,
          boxH - padding * 2,
        );
      } catch {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...COLOR.sub);
        doc.text(fallback, x + boxW / 2, yPos + boxH / 2, {
          align: "center",
        });
      }
    };

    const logos = await loadLogos();

    // Mapa de hora -> pre?o para lookup r?pido nas caixas
    const priceByHour = new Map<number, number>();
    for (const { hour, total } of revisionPrices) {
      priceByHour.set(hour, total);
    }
    const laborPriceByHour = new Map<number, number>();
    for (const { hour, total } of laborRevisionPrices) {
      laborPriceByHour.set(hour, total);
    }

    const equipmentImage = await loadMachineImage(modelSuffix(selectedModel));
    const clienteLabel = customerName || "";

    const emailLabel = customerEmail || "";
    const phoneLabel = customerPhone || "";
    const chassisLabel = (customerChassis ?? "").trim();
    const chassisDisplay = chassisLabel ? chassisLabel.toUpperCase() : "";

    const modeloLabel = modelSuffix(selectedModel);
    const regionLabel = region || t("common.notProvided");
    const sellerLabel = sellerName || t("common.notProvided");
    const planLabelUpper = (planTypeLabel || "").trim()
      ? ((planTypeLabel || "").trim().toLocaleUpperCase?.() ??
        (planTypeLabel || "").trim().toUpperCase())
      : "";
    const isEssentialPlan =
      planLabelUpper.includes("ESSENCIAL") ||
      planLabelUpper.includes("ESSENTIAL");

    // const totalLabel = t("pdf.totalPerRevision", "Total da revisão");

    const buildTotalDisplay = (
      baseTotal: number,
      finalTotal?: number | null,
    ) => {
      const safeBase = Math.max(baseTotal, 0);
      const safeFinal = finalTotal == null ? safeBase : Math.max(finalTotal, 0);
      const hasDiscount =
        Math.abs(safeBase - safeFinal) > 0.009 && safeBase > 0;
      const mainText = hasDiscount
        ? `${fmtCurrency(safeBase)} >> ${fmtCurrency(safeFinal)}`
        : fmtCurrency(safeBase);
      const diffText = hasDiscount
        ? `Desconto: ${fmtCurrency(Math.max(safeBase - safeFinal, 0))}`
        : null;
      return { mainText, diffText };
    };

    const termsTitle = t(
      "pdf.terms",
      t("pdf.termsConditions", "TERMOS E CONDIÇÕES"),
    );
    const termsMain = t("pdf.termsMain");
    const nonEligibleTitle = t("pdf.nonEligibleTitle");
    const nonEligibleItems = t("pdf.nonEligibleItems");
    const coverageEndTitle = t("pdf.coverageEndTitle");
    const coverageEnd = t("pdf.coverageEnd");
    const planTitleBase = t("pdf.essentialPlanTitle", "JOHN DEERE PROTECT");
    const planTitle = planLabelUpper
      ? `${planTitleBase} ${planLabelUpper}`
      : planTitleBase;

    // Titulo principal
    doc.setFillColor(...COLOR.band);
    const bandH = 40;
    doc.rect(M, M, innerW, bandH, "F");

    doc.setTextColor(...COLOR.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const proposalTitleBase = t(
      "pdf.essentialPiecesProposal",
      "Proposta John Deere Protect",
    );
    const mainTitle = planLabelUpper
      ? `${proposalTitleBase} ${planLabelUpper}`
      : `${proposalTitleBase}`;
    doc.text(mainTitle, M + 12, M + 26);

    let y = M + bandH + 8;

    // Linha superior: logos mockadas + dados gerais (data, regiao, vendedor)
    const logoBoxH = 60;
    const logoBoxW = 150;
    const gap = 8;
    const logosAreaW = innerW * 0.52;
    const logosTotalW = logoBoxW * 2 + gap;
    const logosStartX = M + Math.max(0, (logosAreaW - logosTotalW) / 2);

    // Box de informacoes gerais a direita
    const infoX = M + logosAreaW + gap + 36;
    const infoW = innerW - (infoX - M);
    const infoBoxH = logoBoxH + 34;
    const headerBlockH = Math.max(logoBoxH, infoBoxH);
    const logosY = y + (headerBlockH - logoBoxH) / 2;

    // Logo 1 (jd)
    doc.setDrawColor(...COLOR.border);
    addLogo(
      logos.johnDeere ?? "",
      logosStartX - 8,
      logosY - 4,
      logoBoxW + 38,
      logoBoxH + 6,
      "LOGO JD",
    );

    // Logo 2 (Veneza)
    const logo2X = logosStartX + logoBoxW + gap;
    addLogo(
      logos.veneza ?? "",
      logo2X + 20 - 20 / 2,
      logosY - 2,
      logoBoxW + 20,
      logoBoxH + 2,
      "LOGO VENEZA",
    );

    doc.setDrawColor(...COLOR.border);
    doc.rect(infoX, y, infoW, headerBlockH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR.ink);
    doc.text(t("pdf.generalData", "Dados da proposta"), infoX + 10, y + 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const infoLine = (
      label: string,
      value: string,
      offset: number,
      labelWidth?: number,
    ) => {
      doc.setTextColor(...COLOR.sub);
      const fixedLabelWidth =
        labelWidth ?? (doc.getTextWidth(label || "") || 0);
      doc.text(label, infoX + 10, y + offset);
      doc.setTextColor(...COLOR.ink);
      doc.text(value, infoX + 10 + fixedLabelWidth + 4, y + offset);
    };

    const dateLabel = t("pdf.proposalDate", "Data da proposta:");
    const regionTitle = t("pdf.region", "Região:");
    const sellerTitle = t("pdf.sellerResponsible", "Responsável pela venda:");
    const serviceTypeTitle = t("filters.serviceType", "Tipo de atendimento:");
    const paymentConditionTitle = t(
      "pdf.paymentCondition",
      t("filters.paymentCondition", "Condição de pagamento:"),
    );
    const paymentConditionValue =
      paymentConditionLabel || t("common.notProvided");

    const maxLabelWidth = Math.max(
      doc.getTextWidth(dateLabel),
      doc.getTextWidth(regionTitle),
      doc.getTextWidth(sellerTitle),
      doc.getTextWidth(serviceTypeTitle),
      doc.getTextWidth(paymentConditionTitle),
    );

    const infoStartOffset = 30;
    const infoLineGap = 14;

    infoLine(dateLabel, dfmt.format(now), infoStartOffset, maxLabelWidth);
    infoLine(
      regionTitle,
      regionLabel,
      infoStartOffset + infoLineGap,
      maxLabelWidth,
    );
    infoLine(
      serviceTypeTitle,
      serviceTypeLabel,
      infoStartOffset + infoLineGap * 2,
      maxLabelWidth,
    );
    infoLine(
      paymentConditionTitle,
      paymentConditionValue,
      infoStartOffset + infoLineGap * 3,
      maxLabelWidth,
    );
    infoLine(
      sellerTitle,
      sellerLabel,
      infoStartOffset + infoLineGap * 4,
      maxLabelWidth,
    );

    y += headerBlockH + 5;

    // DADOS DO CLIENTE (mesmo estilo de "BENEFÍCIOS")
    const clienteTitleH = 24;
    const clienteBoxH = 90;

    // garante espaço para faixa + caixa
    y = addPageIfNeeded(clienteTitleH + clienteBoxH, y);

    // faixa amarela
    doc.setFillColor(...COLOR.band);
    doc.rect(M, y, innerW, clienteTitleH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(t("pdf.customerData", "DADOS DO CLIENTE"), M + 10, y + 16);

    // caixa de conteúdo
    y += clienteTitleH + 6;
    doc.setDrawColor(...COLOR.border);
    doc.rect(M, y, innerW, clienteBoxH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const equipmentImageBoxW = 170;
    const equipmentImageBoxH = clienteBoxH - 16;
    const equipmentImageBoxX = M + innerW - equipmentImageBoxW - 10;
    const equipmentImageBoxY = y + 8;
    const textStartX = M + 12;

    const cLine = (label: string, value: string, offset: number) => {
      doc.setTextColor(...COLOR.sub);
      doc.text(label, textStartX, y + offset);
      doc.setTextColor(...COLOR.ink);
      doc.text(value, textStartX + doc.getTextWidth(label) + 6, y + offset);
    };

    doc.setDrawColor(...COLOR.border);
    doc.setFillColor(...COLOR.light);
    if (equipmentImage) {
      try {
        const { width, height } = doc.getImageProperties(equipmentImage);
        const scale = Math.min(
          equipmentImageBoxW / width,
          equipmentImageBoxH / height,
        );
        const imgW = width * scale;
        const imgH = height * scale;
        const imgX = equipmentImageBoxX + (equipmentImageBoxW - imgW) / 2;
        const imgY = equipmentImageBoxY + (equipmentImageBoxH - imgH) / 2;
        doc.addImage(equipmentImage, "PNG", imgX, imgY, imgW, imgH);
      } catch {
        // ignore if image fails to render
      }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    cLine(t("pdf.customerName", "Nome/Razão Social:"), clienteLabel, 18);
    cLine(t("pdf.customerEmail", "E-mail:"), emailLabel, 18 + 15 * 1);
    cLine(t("pdf.customerPhone", "Telefone:"), phoneLabel, 18 + 15 * 2);
    cLine(
      t("pdf.chassis", "Chassi do equipamento:"),
      chassisDisplay,
      18 + 15 * 3,
    );
    cLine(t("pdf.equipment", "Equipamento:"), equipmentName, 18 + 15 * 4);

    y += clienteBoxH + 8;

    // Equipamento / Modelo
    // const eqBoxH = 25;
    // y = addPageIfNeeded(eqBoxH, y);
    // doc.setDrawColor(...COLOR.border);
    // doc.rect(M, y, innerW, eqBoxH);

    // doc.setFont("helvetica", "bold");
    // doc.setFontSize(11);
    // doc.setTextColor(...COLOR.ink);
    // doc.text(t("pdf.equipment", "Equipamento:"), M + 10, y + 16);

    // doc.setFont("helvetica", "normal");
    // doc.setFontSize(10);
    // const equipText = `${equipmentName}`;
    // doc.text(
    //   equipText,
    //   M + 10 + doc.getTextWidth(t("pdf.equipment", "Equipamento:")) + 16,
    //   y + 16
    // );

    // y += eqBoxH + 8;

    // BENEFÍCIOS (lista estática; você mapeia no i18n)
    doc.setFillColor(...COLOR.band);
    const benefTitleH = 24;
    doc.rect(M, y, innerW, benefTitleH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(t("pdf.benefitsTitle", "BENEFÍCIOS"), M + 10, y + 16);

    y += benefTitleH + 5;

    const benefitsLines = [
      isEssentialPlan
        ? "Manutenção Preventiva a cada 500 horas feita pelo cliente"
        : "Manutenção Preventiva a cada 500 horas feita pelo Distribuidor John Deere",
      "Inspeção da Máquina a cada 2000 horas feita pelo Distribuidor John Deere",
      "Peças Originais John Deere para Manutenção de Preventivas",
      isEssentialPlan
        ? "Análise de Fluidos coletado pelo cliente"
        : "Análise de Fluidos coletado pelo Distribuidor John Deere",
      "Agilidade das informações para tomada de decisões",
      "Contato com Suporte de Telemetria",
      "Tratativas de Códigos de Diagnóstico",
      "Treinamento da Ferramenta Operation Center",
      "Reprogramação de Software Remota",
      "Consultoria de Performance",
    ].filter(Boolean);

    // Renderiza benefícios em duas colunas com até 6 itens cada
    const itemsPerColumn = 5;
    const columns = 2;
    const colWidth = innerW / columns + 50;
    const bulletIndent = 12;
    const lineHeight = lh(9);

    doc.setFontSize(9);

    // calcula altura necessária para cada coluna (considerando quebras de linha)
    const columnHeights = Array(columns).fill(0);
    for (const [idx, line] of benefitsLines.entries()) {
      const col = idx < itemsPerColumn ? 0 : 1;
      const text = `• ${line}`;
      const wrapped = doc.splitTextToSize(
        text,
        colWidth - bulletIndent * 2,
      ) as string[];
      columnHeights[col] += lineHeight * wrapped.length;
    }
    const benefitsBoxH = Math.max(80, Math.max(...columnHeights)) - 10;

    y = addPageIfNeeded(benefitsBoxH, y);
    doc.setDrawColor(...COLOR.border);
    doc.rect(M, y, innerW, benefitsBoxH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.ink);

    const offsets = Array(columns).fill(0);
    for (const [idx, line] of benefitsLines.entries()) {
      const col = idx < itemsPerColumn ? 0 : 1;
      const text = `• ${line}`;
      const wrapped = doc.splitTextToSize(
        text,
        colWidth - bulletIndent * 2,
      ) as string[];
      const x = M + col * colWidth + bulletIndent;
      const yPos = y + 16 + offsets[col] - 2;
      doc.text(wrapped, x, yPos);
      offsets[col] += lineHeight * wrapped.length;
    }

    y = y + benefitsBoxH + 7;

    // Bloco do plano / ciclo de horas
    y = addPageIfNeeded(80, y);
    doc.setFillColor(...COLOR.band);
    doc.rect(M, y, innerW, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(planTitle, M + 10, y + 16);

    y += 29;

    const cycleBoxH = 56 - 18;
    y = addPageIfNeeded(cycleBoxH, y);
    doc.setDrawColor(...COLOR.border);
    doc.rect(M, y, innerW, cycleBoxH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const travelLabel = t("pdf.travelKm", "Ida + Volta (Km):");
    const kmValueLabel = t("pdf.kmValue", "Valor Km:");
    const travelCostLabel = t("pdf.travelCost", "Custo Desloc. Total:");
    // const partsLabel = t("pdf.partsDiscount", "Desconto Peças:");
    const discountLabel = "Descontos:";
    const colW = innerW / 5; // agora s?o 5 colunas
    const periodHours = Math.max(
      Math.abs(cycleEndHour - cycleStartHour) + 500,
      0,
    );
    const discountedPartsTotal = Math.max(
      partsTotalBase * (1 - partsDiscountPercent),
      0,
    );
    const partsPerHour =
      periodHours > 0 ? discountedPartsTotal / periodHours : null;
    const partsPerHourText = `${fmtCurrency(partsPerHour)}`;

    const cycleY = y + 15;

    // --- COLUNA 1: PEÇAS / H ---
    doc.setTextColor(...COLOR.sub);
    doc.text("Peças / h:", M + 10, cycleY);
    doc.setTextColor(...COLOR.ink);
    doc.text(partsPerHourText, M + 10, cycleY + 14);

    // --- COLUNA 2: KM TOTAL ---
    doc.setTextColor(...COLOR.sub);
    doc.text(travelLabel, M + colW + 10, cycleY);
    doc.setTextColor(...COLOR.ink);
    doc.text(`${safeTravelKm.toFixed(0)} Km`, M + colW + 10, cycleY + 14);

    // --- COLUNA 3: VALOR KM ---
    doc.setTextColor(...COLOR.sub);
    doc.text(kmValueLabel, M + colW * 2 + 10, cycleY);
    doc.setTextColor(...COLOR.ink);
    doc.text(fmtCurrency(safeKmValue), M + colW * 2 + 10, cycleY + 14);

    // --- COLUNA 4: CUSTO FINAL KM ---
    doc.setTextColor(...COLOR.sub);
    doc.text(travelCostLabel, M + colW * 3 + 10, cycleY);
    doc.setTextColor(...COLOR.ink);
    doc.text(fmtCurrency(safeTravelCost), M + colW * 3 + 10, cycleY + 14);

    // // --- COLUNA 4: DESCONTO PE?AS ---
    // doc.setTextColor(...COLOR.sub);
    // doc.text(partsLabel, M + colW * 3 + 10, cycleY);
    // doc.setTextColor(...COLOR.ink);
    // doc.text(
    //   `${(partsDiscountPercent * 100).toFixed(0)}%`,
    //   M + colW * 3 + 10,
    //   cycleY + 14
    // );

    // --- COLUNA 5: DESCONTO MO ---
    doc.setTextColor(...COLOR.sub);
    doc.text(discountLabel, M + colW * 4 + 10, cycleY);
    doc.setTextColor(...COLOR.ink);
    doc.text(
      `Peças: ${(partsDiscountPercent * 100).toFixed(0)}% / M.O.: ${(
        laborDiscountPercent * 100
      ).toFixed(0)}%`,
      M + colW * 4 + 10,
      cycleY + 14,
    );

    y += cycleBoxH + 10;

    // Caixa de texto (placeholder) acima da grade de revisoes

    const notePaddingX = 10;
    const notePaddingY = 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.ink);
    const noteLines = doc.splitTextToSize(
      `A cada 2.000 horas de uso, é necessária uma inspeção obrigatória realizada pelo distribuidor autorizado, que inclue calibração de válvula de motor, calibração dos motores, bombas hidrostáticas e atualização de software, além da medição do material rodante a cada 500h.`,
      innerW - notePaddingX * 2,
    ) as string[];
    const noteBoxH = 32;
    y = addPageIfNeeded(noteBoxH + 12, y);
    doc.setDrawColor(...COLOR.border);
    doc.setFillColor(...COLOR.light);
    doc.rect(M, y, innerW, noteBoxH, "FD");
    doc.text(noteLines, M + notePaddingX, y + notePaddingY);

    y += noteBoxH + 20;

    // Grade das revisoes: caixas menores por hora
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR.ink);
    const cycleLabelRange = `${String(
      Math.min(cycleStartHour, cycleEndHour),
    )}h - ${String(Math.max(cycleStartHour, cycleEndHour))}h`;
    doc.text(`${t("pdf.revisions", "Revisões")} (${cycleLabelRange}):`, M, y);
    y += 10;

    const gridTopPadding = 4;
    y += gridTopPadding;

    // const boxH = 48; // altura menor
    const boxH = 40; // altura menor
    const boxesPerRow = 5; // 5 por linha
    const boxGap = 8; // gap menor
    const totalGap = boxGap * (boxesPerRow - 1);
    const boxW = (innerW - totalGap) / boxesPerRow;

    const drawRevisionBox = (x: number, yPos: number, hour: number) => {
      const label = `${hour}h`;
      const price = priceByHour.get(hour);
      const laborPrice = laborPriceByHour.get(hour);
      const priceStr =
        price != null ? fmtCurrency(price) : t("common.notProvided");
      const laborStr =
        laborPrice != null ? fmtCurrency(laborPrice) : t("common.notProvided");

      doc.setDrawColor(...COLOR.border);
      doc.setFillColor(...COLOR.light);
      doc.rect(x, yPos, boxW, boxH, "FD");

      // Label da revisão (esquerda)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.ink);
      doc.text(label, x + 5, yPos + 12);

      const rightX = x + boxW - 5; // coluna da direita

      // ---- Peças ----
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...COLOR.ink);

      // texto "Peças:" à esquerda
      doc.text("Peças:", x + 5, yPos + 14 + 10);

      // valor à direita
      doc.text(priceStr, rightX, yPos + 14 + 10, {
        align: "right",
      });

      // ---- M.O. ----
      doc.text("M.O.:", x + 5, yPos + 14 + 20);

      doc.text(laborStr, rightX, yPos + 14 + 20, {
        align: "right",
      });
    };

    const hoursForGrid = Array.from(
      new Set([
        ...revisionPrices.map((r) => r.hour),
        ...laborRevisionPrices.map((r) => r.hour),
      ]),
    ).sort((a, b) => a - b);

    let colIndex = 0;
    for (const hour of hoursForGrid) {
      // Quebra de página se precisar de mais espaço para a linha de boxes
      y = addPageIfNeeded(boxH + 16, y);

      const x = M + colIndex * (boxW + boxGap);
      drawRevisionBox(x, y, hour);

      colIndex += 1;
      if (colIndex >= boxesPerRow) {
        colIndex = 0;
        y += boxH + 8; // gap vertical menor
      }
    }

    if (hoursForGrid.length > 0 && colIndex !== 0) {
      y += boxH + 8;
    } else if (hoursForGrid.length > 0) {
      y += 8;
    }

    // Somatórios em caixa de destaque
    // const totalPartsValue = hoursForGrid.reduce((acc, hour) => {
    //   const v = priceByHour.get(hour) ?? 0;
    //   return acc + v;
    // }, 0);

    const totalPartsLabel = t("pdf.revisionsTotalParts", "Total Peças:");
    const totalLaborLabel = t("pdf.revisionsTotalLabor", "Total M.O.:");

    const sumBoxH = partsDiscountPercent + laborDiscountPercent == 0 ? 44 : 56;
    const desiredY = pageH - M - sumBoxH;
    if (y > desiredY) {
      doc.addPage();
      y = M;
    }
    const sumBoxY = pageH - M - sumBoxH;

    const partsDisplay = buildTotalDisplay(
      partsTotalBase,
      partsTotalBase * (1 - partsDiscountPercent),
    );
    const laborBaseTotal = laborTotalBase + safeTravelCost;
    const laborFinalTotal =
      laborTotalBase * (1 - laborDiscountPercent) + safeTravelCost;
    const laborDisplay = buildTotalDisplay(laborBaseTotal, laborFinalTotal);
    const overallDisplay = buildTotalDisplay(
      totalFinalBase,
      totalFinalDiscounted,
    );

    doc.setDrawColor(...COLOR.border);
    doc.setFillColor(255, 247, 200); // um amarelo bem claro para destaque
    doc.rect(M, sumBoxY, innerW, sumBoxH, "FD");

    const sumColW = innerW / 3;

    // Lado esquerdo: Total Peças
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(totalPartsLabel, M + 6, sumBoxY + 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(partsDisplay.mainText, M + 6, sumBoxY + 34);
    if (partsDisplay.diffText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.sub);
      doc.text(partsDisplay.diffText, M + 6, sumBoxY + 46);
      doc.setTextColor(...COLOR.ink);
    }

    // Lado direito: Total M.O.
    const rightX = M + sumColW + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(totalLaborLabel, rightX, sumBoxY + 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(laborDisplay.mainText, rightX, sumBoxY + 34);
    if (laborDisplay.diffText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.sub);
      doc.text(laborDisplay.diffText, rightX, sumBoxY + 46);
      doc.setTextColor(...COLOR.ink);
    }

    // Total geral (peças + M.O.)
    const totalOverallLabel = t("pdf.revisionsTotalOverall", "Total Geral:");
    const overallX = M + sumColW * 2 + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(totalOverallLabel, overallX, sumBoxY + 18);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(overallDisplay.mainText, overallX, sumBoxY + 34);
    if (overallDisplay.diffText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.sub);
      doc.text(overallDisplay.diffText, overallX, sumBoxY + 46);
      doc.setTextColor(...COLOR.ink);
    }

    y = pageH - M + 20;

    // Garante que os termos iniciem sempre em uma nova pagina (segunda pagina)
    doc.addPage();
    y = M;

    // TERMOS / NÃO ELEGÍVEIS / TÉRMINO DA COBERTURA
    const termosTitleH = 24;
    y = addPageIfNeeded(termosTitleH, y);
    doc.setFillColor(...COLOR.band);
    doc.rect(M, y, innerW, termosTitleH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(termsTitle, M + 10, y + 16);
    y += termosTitleH + 20;

    doc.setTextColor(...COLOR.ink);
    const sectionLineHeight = lh(8.5);
    const renderSection = (title: string, content: string) => {
      const safeText = content || t("common.notProvided", "Não informado");
      const maxWidth = innerW - 4; // usa quase toda a largura útil
      const lines = doc.splitTextToSize(safeText, maxWidth) ?? [];
      let idx = 0;
      while (idx < lines.length) {
        const remaining = lines.length - idx;
        const linesPerPage = Math.min(30, remaining);
        const block = lines.slice(idx, idx + linesPerPage);
        const needed = 12 + sectionLineHeight * block.length + 8;
        y = addPageIfNeeded(needed, y);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(title, M, y);
        y += 12;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(block, M, y, { maxWidth });
        y += sectionLineHeight * block.length + 10;
        idx += linesPerPage;
      }
    };

    const renderSection2 = (title: string, content: string) => {
      const safeText = content || t("common.notProvided", "Não informado");
      const maxWidth = innerW + 295; // usa quase toda a largura útil
      const lines = doc.splitTextToSize(safeText, maxWidth) ?? [];
      let idx = 0;
      while (idx < lines.length) {
        const remaining = lines.length - idx;
        const linesPerPage = Math.min(30, remaining);
        const block = lines.slice(idx, idx + linesPerPage);
        const needed = 12 + sectionLineHeight * block.length + 8;
        y = addPageIfNeeded(needed, y);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(title, M, y);
        y += 12;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(block, M, y, { maxWidth });
        y += sectionLineHeight * block.length + 10;
        idx += linesPerPage;
      }
    };

    renderSection2(termsTitle, termsMain);
    renderSection(nonEligibleTitle, nonEligibleItems);
    renderSection(coverageEndTitle, coverageEnd);

    // Assinatura do cliente no rodapé
    const footerH = 50;
    y = addPageIfNeeded(footerH, y);

    const signY = pageH - M - footerH;
    doc.setDrawColor(...COLOR.border);
    doc.rect(M, signY, innerW, footerH);

    const lineY = signY + 30;
    doc.line(M + 20, lineY, M + innerW - 20, lineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.sub);
    doc.text(
      t("pdf.customerSignature", "Assinatura do Cliente:"),
      M + 20,
      lineY + 14,
    );

    // Validade da proposta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.ink);
    const prazoTxt = t("pdf.validity", {
      date: dfmt.format(validity),
      defaultValue: "Proposta válida até {{date}}",
    });
    doc.text(prazoTxt, M + 20, signY - 8);

    // Nome do arquivo
    const chassisSuffix = chassisDisplay;
    const filenameBase = `${t(
      "pdf.filePrefixEssential",
      "JD_" + planTypeLabel + "_Pecas",
    )}_${modeloLabel}_${cycleStartHour}h-${cycleEndHour}h`;
    const filename = normalizePdfFilename(
      `${filenameBase}${chassisSuffix ? `_${chassisSuffix}` : ""}.pdf`,
    );
    const blob = doc.output("blob") as Blob;
    return { blob, filename };
  }, [
    // user,
    customerName,
    customerEmail,
    customerPhone,
    customerChassis,
    equipmentName,
    selectedModel,
    modelSuffix,
    region,
    sellerName,
    planTypeLabel,
    serviceTypeLabel,
    paymentConditionLabel,
    cycleStartHour,
    cycleEndHour,
    travelKm,
    kmValue,
    travelCost,
    partsDiscountPercent,
    partsTotalBase,
    totalFinalBase,
    totalFinalDiscounted,
    laborTotalBase,
    laborDiscountPercent,
    revisionPrices,
    laborRevisionPrices,
    fmtCurrency,
    t,
    locale,
  ]);
}
