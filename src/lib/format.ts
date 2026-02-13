export const formatQuantity = (value?: number | null) => {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR").format(value);
};

export const formatCurrencyBRL = (value?: number | null) => {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};
