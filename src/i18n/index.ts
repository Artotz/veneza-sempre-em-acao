import ptBR from "./pt-BR";

export type Locale = "pt-BR";

type MessageValues = Record<string, string | number>;
type Messages = Record<string, string>;

const messagesByLocale: Record<Locale, Messages> = {
  "pt-BR": ptBR,
};

let currentLocale: Locale = "pt-BR";

export const setLocale = (locale: Locale) => {
  currentLocale = locale;
};

export const getLocale = () => currentLocale;

const applyVariables = (message: string, values?: MessageValues) => {
  if (!values) return message;
  return message.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const trimmed = String(key).trim();
    if (!trimmed) return match;
    const value = values[trimmed];
    if (value === undefined || value === null) return match;
    return String(value);
  });
};

export const t = (key: string, values?: MessageValues) => {
  const messages = messagesByLocale[currentLocale] ?? {};
  const message = messages[key] ?? key;
  return applyVariables(message, values);
};
