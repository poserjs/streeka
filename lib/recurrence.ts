import type { Task, Weekday } from "../types/task";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtcDate = (value: Date | string): Date => {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const isBefore = (left: Date, right: Date): boolean =>
  left.getTime() < right.getTime();
const isAfter = (left: Date, right: Date): boolean =>
  left.getTime() > right.getTime();
const isSameDay = (left: Date, right: Date): boolean =>
  left.getTime() === right.getTime();

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * MS_PER_DAY);

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const monthIndex = (date: Date): number =>
  date.getUTCFullYear() * 12 + date.getUTCMonth();

const isMonthAligned = (
  date: Date,
  startDate: Date,
  interval?: number,
): boolean => {
  if (!interval || interval <= 1) {
    return true;
  }

  return (monthIndex(date) - monthIndex(startDate)) % interval === 0;
};

const getNthWeekdayDate = (
  year: number,
  month: number,
  weekday: Weekday,
  nth: 1 | 2 | 3 | 4 | 5 | -1,
): Date | null => {
  const targetIndex = WEEKDAY_INDEX[weekday];
  const daysInTargetMonth = daysInMonth(year, month);

  if (nth === -1) {
    for (let day = daysInTargetMonth; day >= 1; day -= 1) {
      const candidate = new Date(Date.UTC(year, month, day));
      if (candidate.getUTCDay() === targetIndex) {
        return candidate;
      }
    }

    return null;
  }

  let count = 0;
  for (let day = 1; day <= daysInTargetMonth; day += 1) {
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getUTCDay() === targetIndex) {
      count += 1;
      if (count === nth) {
        return candidate;
      }
    }
  }

  return null;
};

const occursOnDate = (task: Task, date: Date, startDate: Date): boolean => {
  const { schedule } = task;
  const dateWeekday = date.getUTCDay();

  switch (schedule.type) {
    case "daily":
    case "n-times-daily":
      return true;
    case "days-of-week":
      return schedule.days.some((day) => WEEKDAY_INDEX[day] === dateWeekday);
    case "nth-weekday": {
      if (!isMonthAligned(date, startDate, schedule.monthInterval)) {
        return false;
      }

      const target = getNthWeekdayDate(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        schedule.weekday,
        schedule.nth,
      );

      return target !== null && isSameDay(target, date);
    }
    case "day-of-month": {
      if (!isMonthAligned(date, startDate, schedule.monthInterval)) {
        return false;
      }

      if (schedule.day === "last") {
        return (
          date.getUTCDate() ===
          daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
        );
      }

      return date.getUTCDate() === schedule.day;
    }
    default:
      return false;
  }
};

const occurrencesOnDate = (task: Task): number => {
  if (task.schedule.type === "n-times-daily") {
    return Math.max(0, task.schedule.timesPerDay);
  }

  return 1;
};

const countOccurrencesThroughDate = (task: Task, date: Date): number => {
  const startDate = toUtcDate(task.startDate);
  if (isAfter(startDate, date)) {
    return 0;
  }

  let current = startDate;
  let total = 0;

  while (!isAfter(current, date)) {
    if (occursOnDate(task, current, startDate)) {
      total += occurrencesOnDate(task);
    }
    current = addDays(current, 1);
  }

  return total;
};

export const getTasksForDate = (tasks: Task[], date: Date | string): Task[] => {
  const targetDate = toUtcDate(date);

  return tasks.filter((task) => {
    const startDate = toUtcDate(task.startDate);

    if (isBefore(targetDate, startDate)) {
      return false;
    }

    if (task.endDate) {
      const endDate = toUtcDate(task.endDate);
      if (isAfter(targetDate, endDate)) {
        return false;
      }
    }

    if (!occursOnDate(task, targetDate, startDate)) {
      return false;
    }

    if (task.maxOccurrences) {
      const occurrencesBefore = countOccurrencesThroughDate(
        task,
        addDays(targetDate, -1),
      );
      return occurrencesBefore < task.maxOccurrences;
    }

    return true;
  });
};
