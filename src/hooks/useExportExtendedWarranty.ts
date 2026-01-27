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
  paymentConditionLabel: string;
  warrantyTypeLabel?: string | null;

  // Tradução / locale
  t: TFunction<"translation">;
  locale: string;

  // Cobertura selecionada
  coverageApplicationLabel?: string | null;
  coverageModalityLabel?: string | null;
  coverageDurationMonths?: number | null;
  coverageDurationHours?: number | null;
  coverageValue?: number | null;
  coverageValueBase?: number | null;
  coverageDiscountPercent?: number | null;
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
  paymentConditionLabel,
  warrantyTypeLabel,
  t,
  locale,
  coverageApplicationLabel,
  coverageModalityLabel,
  coverageDurationMonths,
  coverageDurationHours,
  coverageValue,
  coverageValueBase,
  coverageDiscountPercent,
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
    const currencyFmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
    const buildTotalDisplay = (
      baseTotal?: number | null,
      finalTotal?: number | null
    ) => {
      const hasBase = Number.isFinite(baseTotal as number);
      const hasFinal = Number.isFinite(finalTotal as number);
      if (!hasBase && !hasFinal) {
        return { mainText: t("common.notProvided"), diffText: null };
      }
      const safeBase = hasBase
        ? Math.max(baseTotal as number, 0)
        : Math.max(finalTotal as number, 0);
      const safeFinal = hasFinal ? Math.max(finalTotal as number, 0) : safeBase;
      const hasDiscount =
        Math.abs(safeBase - safeFinal) > 0.009 && safeBase > 0;
      const mainText = hasDiscount
        ? `${currencyFmt.format(safeBase)} >> ${currencyFmt.format(safeFinal)}`
        : currencyFmt.format(safeFinal);
      const diffText = hasDiscount
        ? `Desconto: ${currencyFmt.format(Math.max(safeBase - safeFinal, 0))}`
        : null;
      return { mainText, diffText };
    };

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
      fallback: string
    ) => {
      try {
        const padding = 8;
        doc.addImage(
          dataUrl,
          "PNG",
          x + padding,
          yPos + padding,
          boxW - padding * 2,
          boxH - padding * 2
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

    const equipmentImage = await loadMachineImage(modelSuffix(selectedModel));
    const clienteLabel = customerName || "";

    const emailLabel = customerEmail || "";
    const phoneLabel = customerPhone || "";
    const chassisLabel = (customerChassis ?? "").trim();
    const chassisDisplay = chassisLabel ? chassisLabel.toUpperCase() : "";

    const modeloLabel = modelSuffix(selectedModel);
    const regionLabel = region || t("common.notProvided");
    const sellerLabel = sellerName || t("common.notProvided");
    const warrantyTypeValue =
      (warrantyTypeLabel ?? "").trim() || t("common.notProvided");
    const coverageAppLabel =
      (coverageApplicationLabel ?? "").trim() || t("common.notProvided");
    const coverageModLabel =
      (coverageModalityLabel ?? "").trim() || t("common.notProvided");
    const coverageDurationLabel = `${coverageDurationMonths ?? "-"} meses ou ${
      coverageDurationHours != null
        ? `${coverageDurationHours.toLocaleString(locale)} horas`
        : "-"
    }`;
    const discountPercent =
      coverageDiscountPercent != null &&
      Number.isFinite(coverageDiscountPercent)
        ? Math.max(0, Math.min(coverageDiscountPercent, 0.15))
        : 0;
    const coverageDiscountLabel = `${Math.round(discountPercent * 100)}%`;
    const currencyOrNotProvided = (value?: number | null) =>
      value != null ? currencyFmt.format(value) : t("common.notProvided");
    const normalizedCoverageBase =
      coverageValueBase != null
        ? coverageValueBase
        : discountPercent > 0 && coverageValue != null
        ? coverageValue / (1 - discountPercent)
        : coverageValue ?? null;
    const normalizedCoverageFinal =
      coverageValue != null
        ? coverageValue
        : normalizedCoverageBase != null && discountPercent > 0
        ? normalizedCoverageBase * (1 - discountPercent)
        : normalizedCoverageBase;
    const coverageValueLabel = currencyOrNotProvided(coverageValue);
    const coverageDisplay = buildTotalDisplay(
      normalizedCoverageBase,
      normalizedCoverageFinal
    );
    const coverageValueHighlightLabel = coverageDisplay.mainText;

    // const totalLabel = t("pdf.totalPerRevision", "Total da revisão");

    const termsTitle = t(
      "pdf.terms",
      t("pdf.termsConditions", "TERMOS E CONDIÇÕES")
    );
    const termsMain = t("pdf.termsMain");
    const nonEligibleTitle = t("pdf.nonEligibleTitle");
    const nonEligibleItems = t("pdf.nonEligibleItems");
    const coverageEndTitle = t("pdf.coverageEndTitle");
    const coverageEnd = t("pdf.coverageEnd");

    // Titulo principal
    doc.setFillColor(...COLOR.band);
    const bandH = 40;
    doc.rect(M, M, innerW, bandH, "F");

    doc.setTextColor(...COLOR.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    const proposalTitleBase = t("pdf.powerGardProposal");
    doc.text(proposalTitleBase, M + 12, M + 26);

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
      "LOGO JD"
    );

    // Logo 2 (Veneza)
    const logo2X = logosStartX + logoBoxW + gap;
    addLogo(
      logos.veneza ?? "",
      logo2X + 20 - 20 / 2,
      logosY - 2,
      logoBoxW + 20,
      logoBoxH + 2,
      "LOGO VENEZA"
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
      labelWidth?: number
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
    const warrantyTypeTitle = t("filters.warrantyType", "Tipo de garantia:");
    const paymentConditionTitle = t(
      "pdf.paymentCondition",
      t("filters.paymentCondition", "Condição de pagamento:")
    );
    const paymentConditionValue =
      paymentConditionLabel || t("common.notProvided");

    const maxLabelWidth = Math.max(
      doc.getTextWidth(dateLabel),
      doc.getTextWidth(regionTitle),
      doc.getTextWidth(sellerTitle),
      doc.getTextWidth(warrantyTypeTitle),
      doc.getTextWidth(paymentConditionTitle)
    );

    const infoStartOffset = 30;
    const infoLineGap = 14;

    infoLine(dateLabel, dfmt.format(now), infoStartOffset, maxLabelWidth);
    infoLine(
      regionTitle,
      regionLabel,
      infoStartOffset + infoLineGap,
      maxLabelWidth
    );
    infoLine(
      warrantyTypeTitle,
      warrantyTypeValue,
      infoStartOffset + infoLineGap * 2,
      maxLabelWidth
    );
    infoLine(
      paymentConditionTitle,
      paymentConditionValue,
      infoStartOffset + infoLineGap * 3,
      maxLabelWidth
    );
    infoLine(
      sellerTitle,
      sellerLabel,
      infoStartOffset + infoLineGap * 4,
      maxLabelWidth
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
          equipmentImageBoxH / height
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
      18 + 15 * 3
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
      "Previsibilidade do custos de manutenção",
      "Monitoramento telemétrico - Diminuição dos impactos de corretivas",
      "Consultoria de performance - Busca dos pontos de melhoria",
      "Preços diferenciados",
      "Prognósticos, diagnósticos e atualizações remotas",
      "Agilidade das informações para tomada de decisões",
      "Prioridade nos atendimentos",
      "Pacote de conectividade de 24 meses",
    ].filter(Boolean);

    // Renderiza benefícios em duas colunas com até 6 itens cada
    const itemsPerColumn = 4;
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
        colWidth - bulletIndent * 2
      ) as string[];
      columnHeights[col] += lineHeight * wrapped.length;
    }
    const benefitsBoxH = Math.max(80, Math.max(...columnHeights)) - 24;

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
        colWidth - bulletIndent * 2
      ) as string[];
      const x = M + col * colWidth + bulletIndent;
      const yPos = y + 16 + offsets[col] - 2;
      doc.text(wrapped, x, yPos);
      offsets[col] += lineHeight * wrapped.length;
    }

    y = y + benefitsBoxH + 7;

    // Resumo da cobertura selecionada (ocupa o restante da página antes dos termos)
    const coverageTitleH = 24;
    const coverageBoxH = 105;
    y = addPageIfNeeded(coverageTitleH + coverageBoxH, y);

    doc.setFillColor(...COLOR.band);
    doc.rect(M, y, innerW, coverageTitleH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(
      t("pdf.warrantySummary", "RESUMO DA PROPOSTA DE GARANTIA"),
      M + 10,
      y + 16
    );

    y += coverageTitleH + 6;
    doc.setDrawColor(...COLOR.border);
    doc.rect(M, y, innerW, coverageBoxH - 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...COLOR.ink);

    const coverageLine = (label: string, value: string, offset: number) => {
      doc.setTextColor(...COLOR.sub);
      doc.text(label, M + 10, y + offset);
      doc.setTextColor(...COLOR.ink);
      doc.text(value, M + 10 + doc.getTextWidth(label) + 6, y + offset);
    };

    coverageLine("Aplicação:", coverageAppLabel, 18);
    coverageLine("Modalidade:", coverageModLabel, 18 + 15);
    coverageLine("Duração:", coverageDurationLabel, 18 + 15 * 2);
    coverageLine("Desconto:", coverageDiscountLabel, 18 + 15 * 3);
    coverageLine("Valor:", coverageValueLabel, 18 + 15 * 4);

    y = y + coverageBoxH + 10;

    // Destaque para valor total (similar ao PDF de peças)
    const totalBoxH = discountPercent == 0 ? 44 : 56;
    const desiredTotalY = pageH - M - totalBoxH;
    if (y > desiredTotalY) {
      doc.addPage();
      y = M;
    }
    const totalBoxY = pageH - M - totalBoxH;

    doc.setDrawColor(...COLOR.border);
    doc.setFillColor(255, 247, 200); // amarelo claro
    doc.rect(M, totalBoxY, innerW, totalBoxH, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR.ink);
    doc.text(
      t("pdf.revisionsTotalOverall", "Total Final:"),
      M + 6,
      totalBoxY + 18
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(coverageValueHighlightLabel, M + 6, totalBoxY + 34);
    if (coverageDisplay.diffText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.sub);
      doc.text(coverageDisplay.diffText, M + 6, totalBoxY + 46);
      doc.setTextColor(...COLOR.ink);
    }

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
      lineY + 14
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
      "JD_PowerGard"
    )}_${modeloLabel}_${coverageDurationMonths}_meses-${coverageDurationHours}h`;
    const filename = normalizePdfFilename(
      `${filenameBase}${chassisSuffix ? `_${chassisSuffix}` : ""}.pdf`
    );
    const blob = doc.output("blob") as Blob;
    return { blob, filename };
  }, [
    customerName,
    customerEmail,
    customerPhone,
    customerChassis,
    equipmentName,
    selectedModel,
    modelSuffix,
    region,
    sellerName,
    paymentConditionLabel,
    warrantyTypeLabel,
    t,
    locale,
    coverageApplicationLabel,
    coverageModalityLabel,
    coverageDurationMonths,
    coverageDurationHours,
    coverageValue,
    coverageValueBase,
    coverageDiscountPercent,
  ]);
}
