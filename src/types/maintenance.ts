// export type Price = {
//   custo?: number | null;
//   margem?: number | null;
//   impostos?: number | null;
//   over?: number | null;
//   preco_publico?: number | null;
//   precoInterno?: number | null;
//   precoExterno?: number | null;
//   jd?: number | null;
// };

export type BranchPrice = {
  precoInterno?: number | null;
  precoExterno?: number | null;
  jd?: number | null;
};

export type Item = {
  venda?: string;
  plano?: string;
  modelo: string;
  hour: number;
  tipo: string;
  codigo: string;
  descricao: string;
  quantidade?: number | null;
  // precos: Price;
  branchPrices?: Record<string, BranchPrice | undefined>;
};

export type LaborValue = {
  modelo: string;
  horas_revisao: number;
  valor_mo?: number | null;
  horas_base?: number | null;
  total_mo?: number | null;
};

export type MaintenanceRevisionItem = {
  codigo: string;
  quantidade?: number | null;
};

export type MaintenanceRevision = {
  horasMO?: number | null;
  itens?:
    | MaintenanceRevisionItem[]
    | Record<string, MaintenanceRevisionItem | null>
    | null;
};

export type MaintenanceModel = {
  custoHoraMO?: number | null;
  manutencoes?: Record<string, MaintenanceRevision | null> | null;
};

export type MaintenanceItemDetails = {
  descricao?: string;
  precos?: Record<string, BranchPrice | null | undefined> | null;
};

export type MaintenancePayload = {
  modelos?: Record<string, MaintenanceModel | null> | null;
  itens?: Record<string, MaintenanceItemDetails | null> | null;
  lastUpdated?: number | null;
};

export type DataShape = {
  machines: string[];
  hours: number[];
  items: Item[];
  labor: LaborValue[];
};
