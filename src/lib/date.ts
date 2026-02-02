export const WEEK_DAYS = [
  { id: "mon", short: "Seg", full: "Segunda", index: 0 },
  { id: "tue", short: "Ter", full: "Terca", index: 1 },
  { id: "wed", short: "Qua", full: "Quarta", index: 2 },
  { id: "thu", short: "Qui", full: "Quinta", index: 3 },
  { id: "fri", short: "Sex", full: "Sexta", index: 4 },
  { id: "sat", short: "Sab", full: "Sabado", index: 5 },
  { id: "sun", short: "Dom", full: "Domingo", index: 6 },
] as const;

const MONTHS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const MONTHS_FULL = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export type MonthOption = {
  id: string;
  date: Date;
  label: string;
};

export type WeekDay = {
  id: (typeof WEEK_DAYS)[number]["id"];
  short: string;
  full: string;
  index: number;
  date: Date;
  label: string;
};

export type MonthWeek = {
  index: number;
  id: string;
  label: string;
  startAt: Date;
  endAt: Date;
  days: WeekDay[];
};

export const getDayIndexMonday = (date: Date) => (date.getDay() + 6) % 7;

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const addMinutes = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + amount);
  return next;
};

export const setTime = (date: Date, hours: number, minutes: number) => {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

export const startOfWeekMonday = (date: Date) => {
  const diff = getDayIndexMonday(date);
  return addDays(date, -diff);
};

export const formatDateShort = (date: Date) => {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = MONTHS_SHORT[date.getMonth()];
  return `${day} ${month}`;
};

export const formatMonthYear = (date: Date) =>
  `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;

export const formatMonthYearLabel = (date: Date) =>
  `${MONTHS_FULL[date.getMonth()]} - ${date.getFullYear()}`;

export const formatMonthParam = (date: Date) => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

export const parseMonthParam = (value: string | null) => {
  if (!value) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
};

export const buildMonthOptions = (
  anchorDate: Date,
  monthsBack = 5,
  monthsAhead = 6
) => {
  const startDate = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth() - monthsBack,
    1
  );
  const totalMonths = monthsBack + monthsAhead + 1;
  return Array.from({ length: totalMonths }).map((_, index) => {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + index,
      1
    );
    return {
      id: formatMonthParam(date),
      date,
      label: formatMonthYearLabel(date),
    };
  });
};

export const formatTime = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const formatWeekRange = (startAt: Date, endAt: Date) =>
  `${formatDateShort(startAt)} - ${formatDateShort(endAt)}`;

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const buildMonthWeeks = (referenceDate: Date, weeksCount?: number) => {
  const monthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  );
  const monthEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0
  );
  const firstWeekStart = startOfWeekMonday(monthStart);
  const lastWeekStart = startOfWeekMonday(monthEnd);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const computedWeeksCount =
    weeksCount ??
    Math.floor((lastWeekStart.getTime() - firstWeekStart.getTime()) / weekMs) +
    1;

  return Array.from({ length: computedWeeksCount }).map((_, index) => {
    const startAt = addDays(firstWeekStart, index * 7);
    const endAt = addDays(startAt, 6);
    endAt.setHours(23, 59, 59, 999);
    const days = WEEK_DAYS.map((day) => {
      const date = addDays(startAt, day.index);
      return {
        id: day.id,
        short: day.short,
        full: day.full,
        index: day.index,
        date,
        label: formatDateShort(date),
      };
    });
    return {
      index,
      id: `week-${index + 1}`,
      label: `Semana ${index + 1}`,
      startAt,
      endAt,
      days,
    };
  });
};
