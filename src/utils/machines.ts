export const familyOrder = [
  "backhoe loaders",
  "wheel loaders",
  "motor graders",
  "crawler dozers",
  "excavators",
] as const;

export const familyLabels: Record<string, string> = {
  "backhoe loaders": "families.backhoe",
  "wheel loaders": "families.wheel",
  "motor graders": "families.motor",
  "crawler dozers": "families.crawler",
  excavators: "families.excavator",
};

// Mapa baseado no conjunto presente em public/data/maintenance.json (campo machines)
// A chave do objeto é o sufixo do modelo (após o '-')
export const familiesMap: Record<string, Record<string, number | null>> = {
  "backhoe loaders": {
    "310L": null,
    "310P": 5.8,
  },
  "wheel loaders": {
    "444G": 8.0,
    "524P": null,
    "524K": null,
    "524K-II": null,
    "544P": null,
    "544K": null,
    "544K-II": null,
    "624P": null,
    "624K": null,
    "644K": null,
    "724K": null,
    "744K": null,
    "824K": null,
    "844K": null,
  },
  "motor graders": {
    "620P": 15.0,
    "620G": 15.0,
    "622G": 15.0,
    "670P": 16.0,
    "670G (6068)": 16.0,
    "670G (6090)": 16.0,
    "670G": 16.0,
    "672G": 16.0,
    "770P": 17.0,
    "770G": 17.0,
  },
  "crawler dozers": {
    "700J": 14.0,
    "700J-II": 14.0,
    "750J": 16.0,
    "750J-II": 16.0,
    "850J": 23.0,
    "850J-II": 23.0,
  },
  excavators: {
    "130P": 12.0,
    "130G": 12.0,
    "160P": 12.0,
    "160G": 12.0,
    "180G": 12.0,
    "200D": 12.0,
    "200G": 12.0,
    "210P": 16.0,
    "210G": 16.0,
    "250P": 17.0,
    "250G": 17.0,
    "350P": 26.0,
    "350G": 26.0,
    "470G": 30.0,
  },
};

export const sanitizeModelName = (value: string) =>
  value.replace(/[\s-]+/g, "").toUpperCase();

const knownModels = new Map<string, string>(
  Object.values(familiesMap).flatMap((models) =>
    Object.keys(models).map(
      (name) => [sanitizeModelName(name), name] as [string, string]
    )
  )
);

export const normalizeModelId = (raw: string) => {
  const trimmed =
    typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  const match = knownModels.get(sanitizeModelName(trimmed));
  return match ?? trimmed;
};

export function modelSuffix(machineId: string) {
  // Converte prefixos numÇricos ("10-444G" >> "444G"), mas preserva traços internos do modelo (ex: "524K-II")
  const trimmed = machineId.trim();
  const parts = trimmed.split("-");
  if (parts.length <= 1) return trimmed;
  const [first, ...rest] = parts;
  const isNumericPrefix = /^[0-9]+$/.test(first);
  return isNumericPrefix ? rest.join("-") : trimmed;
}

export function machinesByFamily(all: string[], family: string) {
  const map = familiesMap[family] || {};
  const normalizedKeys = new Set(
    Object.keys(map).map((key) => sanitizeModelName(key))
  );
  return all.filter((m) => {
    const suffix = modelSuffix(m);
    const normalizedSuffix = sanitizeModelName(suffix);
    const hasMatch = normalizedKeys.has(normalizedSuffix);
    // if (!hasMatch) {
    //   console.log("[machinesByFamily] sem match", {
    //     family,
    //     model: m,
    //     suffix,
    //     normalizedSuffix,
    //     normalizedKeys: Array.from(normalizedKeys).slice(0, 10),
    //     keysCount: normalizedKeys.size,
    //   });
    // }
    return hasMatch;
  });
}

export function findFamilyForModel(models: string[], modelId: string) {
  for (const family of familyOrder) {
    const familyModels = machinesByFamily(models, family);
    if (familyModels.includes(modelId)) {
      return family;
    }
  }
  return null;
}
