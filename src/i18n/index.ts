import resources from "./pt-BR";

export type Locale = keyof typeof resources;

type MessageValues = Record<string, string | number>;
type Messages = Record<string, unknown>;

const messagesByLocale: Record<Locale, Messages> = resources;

let currentLocale: Locale = "pt";

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

const getNestedMessage = (messages: Messages, key: string) => {
  const parts = key.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
};

export const t = (key: string, values?: MessageValues) => {
  const messages = messagesByLocale[currentLocale]?.translation ?? {};
  const message = getNestedMessage(messages, key) ?? key;
  return applyVariables(message, values);
};
