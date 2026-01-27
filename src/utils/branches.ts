export const BRANCH_KEYS = [
  "filters.branches.bayeux",
  "filters.branches.recife",
  "filters.branches.mossoro",
  "filters.branches.salvador",
  "filters.branches.fortaleza",
  "filters.branches.petrolina",
] as const;

export type BranchKey = (typeof BRANCH_KEYS)[number];

const branchSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const BRANCH_SLUG_MAP: Record<string, BranchKey> = {
  bayeux: "filters.branches.bayeux",
  vebayeux: "filters.branches.bayeux",
  recife: "filters.branches.recife",
  verecife: "filters.branches.recife",
  mossoro: "filters.branches.mossoro",
  vemossoro: "filters.branches.mossoro",
  salvador: "filters.branches.salvador",
  vesalvador: "filters.branches.salvador",
  fortaleza: "filters.branches.fortaleza",
  vefortaleza: "filters.branches.fortaleza",
  petrolina: "filters.branches.petrolina",
  vepetrolina: "filters.branches.petrolina",
};

for (const key of BRANCH_KEYS) {
  const slug = branchSlug(key);
  const shortSlug = branchSlug(key.split(".").pop() ?? key);
  BRANCH_SLUG_MAP[slug] = key;
  BRANCH_SLUG_MAP[shortSlug] = key;
}

export function normalizeBranchKey(raw: unknown): BranchKey | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const directMatch = (BRANCH_KEYS as readonly string[]).find(
    (key) => key.toLowerCase() === trimmed.toLowerCase()
  );
  if (directMatch) return directMatch as BranchKey;

  const slug = branchSlug(trimmed);
  return BRANCH_SLUG_MAP[slug] ?? null;
}

export function resolveBranchList(raw: unknown): BranchKey[] {
  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null
    ? Object.values(raw)
    : [];

  const normalized = entries
    .map(normalizeBranchKey)
    .filter((value): value is BranchKey => Boolean(value));

  if (!normalized.length) return [...BRANCH_KEYS];
  return Array.from(new Set(normalized));
}

export function clampBranchIndex(
  index: number,
  branches: readonly BranchKey[]
): number {
  if (!branches.length) return 0;
  if (index < 0) return 0;
  if (index >= branches.length) return branches.length - 1;
  return index;
}
