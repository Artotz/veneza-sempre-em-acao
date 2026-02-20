export const PROTHEUS_LEAD_TYPES = {
  preventiva: "MANUTENCAO PREVENTIVA",
  reconexao: "RECONEXAO",
} as const;

export type ProtheusCountSummary = {
  preventivas: number;
  reconexoes: number;
};

export type ProtheusCountMap = Record<string, ProtheusCountSummary>;

export const getProtheusKey = (document?: string | null) =>
  document?.trim() ?? "";

export const buildProtheusCounts = (
  rows: { a1_cgc?: string | null; tipo_lead?: string | null }[]
): ProtheusCountMap => {
  const counts: ProtheusCountMap = {};
  rows.forEach((row) => {
    const key = getProtheusKey(row.a1_cgc);
    if (!key) return;
    const entry = counts[key] ?? { preventivas: 0, reconexoes: 0 };
    if (row.tipo_lead === PROTHEUS_LEAD_TYPES.preventiva) {
      entry.preventivas += 1;
    } else if (row.tipo_lead === PROTHEUS_LEAD_TYPES.reconexao) {
      entry.reconexoes += 1;
    }
    counts[key] = entry;
  });
  return counts;
};

export const mergeProtheusCounts = (
  base: ProtheusCountMap,
  next: ProtheusCountMap
) => {
  const merged: ProtheusCountMap = { ...base };
  Object.entries(next).forEach(([key, value]) => {
    const current = merged[key] ?? { preventivas: 0, reconexoes: 0 };
    merged[key] = {
      preventivas: current.preventivas + value.preventivas,
      reconexoes: current.reconexoes + value.reconexoes,
    };
  });
  return merged;
};

export const splitProtheusSeries = (
  rows: { serie?: string | null; tipo_lead?: string | null }[]
) => {
  const preventivas: string[] = [];
  const reconexoes: string[] = [];
  rows.forEach((row) => {
    const serie = row.serie?.trim();
    if (!serie) return;
    if (row.tipo_lead === PROTHEUS_LEAD_TYPES.preventiva) {
      preventivas.push(serie);
    } else if (row.tipo_lead === PROTHEUS_LEAD_TYPES.reconexao) {
      reconexoes.push(serie);
    }
  });
  return { preventivas, reconexoes };
};

export const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};
