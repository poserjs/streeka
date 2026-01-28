const MS_PER_DAY = 24 * 60 * 60 * 1000;

const pad = (value: number): string => value.toString().padStart(2, "0");

export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
};

export const parseDateKey = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
};

export const compareDateKeys = (left: string, right: string): number => {
  const leftDate = parseDateKey(left);
  const rightDate = parseDateKey(right);

  if (!leftDate || !rightDate) {
    return 0;
  }

  return leftDate.getTime() - rightDate.getTime();
};

export const getTodayKey = (): string => formatDateKey(new Date());

export const getYesterdayKey = (): string => {
  const today = new Date();
  return formatDateKey(new Date(today.getTime() - MS_PER_DAY));
};

export const isEditableDate = (dateKey: string, todayKey: string): boolean => {
  const date = parseDateKey(dateKey);
  const today = parseDateKey(todayKey);

  if (!date || !today) {
    return false;
  }

  const diff = Math.floor((today.getTime() - date.getTime()) / MS_PER_DAY);
  return diff >= 0 && diff <= 1;
};
