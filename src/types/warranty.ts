export type WarrantyMatrix = (number | null)[][];

export type WarrantyModalities = Partial<
  Record<"TF" | "TFH" | "C", WarrantyMatrix>
>;

export type WarrantyUsage = Partial<
  Record<"C" | "A" | "S" | "G", WarrantyModalities>
>;

export type WarrantyPayload = {
  modelos?: Record<string, WarrantyUsage | null> | null;
  lastUpdated?: number | string | null;
};

export type WarrantyDataShape = {
  machines: string[];
  models: Record<string, WarrantyUsage>;
};
