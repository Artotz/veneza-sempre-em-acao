export function formatSellerName(
  value?: string | null,
  fallback: string = "-"
) {
  if (!value) return fallback;
  const trimmed = value.trim();
  const domainMatch = /@venezanet\.com$/i.test(trimmed);
  if (!domainMatch) return trimmed;

  const local = trimmed.split("@")[0] ?? "";
  const parts = local.split(".").filter(Boolean);
  if (parts.length < 2) return trimmed;

  const formatted = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return formatted || trimmed;
}
