const CSA_CACHE_PREFIX = "csaCache:";

export const getCachedCsa = (userEmail: string) => {
  if (!userEmail) return null;
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(`${CSA_CACHE_PREFIX}${userEmail}`);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const setCachedCsa = (userEmail: string, csa: string | null) => {
  if (!userEmail) return;
  if (typeof window === "undefined") return;
  const trimmed = csa?.trim();
  if (!trimmed) return;
  window.localStorage.setItem(`${CSA_CACHE_PREFIX}${userEmail}`, trimmed);
};
