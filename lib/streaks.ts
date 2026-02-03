import type { Task } from "../types/task";
import { formatDateKey, parseDateKey } from "./dates";
import type { DailyCompletions } from "./storage";
import { getTaskTimesPerDay, getTasksForDate } from "./recurrence";

type CompletionSummary = {
  totalOccurrences: number;
  completedOccurrences: number;
};

export type StreakSummary = {
  currentStreak: number;
  longestStreak: number;
  last7DaysCompletion: number;
  last30DaysCompletion: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getOccurrenceCount = (task: Task): number => getTaskTimesPerDay(task);

const buildCompletionSummary = (
  tasksForDate: Task[],
  completion: Record<string, number> | undefined,
): CompletionSummary => {
  return tasksForDate.reduce<CompletionSummary>(
    (summary, task) => {
      const occurrences = getOccurrenceCount(task);
      const completed = Math.min(completion?.[task.id] ?? 0, occurrences);
      return {
        totalOccurrences: summary.totalOccurrences + occurrences,
        completedOccurrences: summary.completedOccurrences + completed,
      };
    },
    { totalOccurrences: 0, completedOccurrences: 0 },
  );
};

const isCompleteDay = (summary: CompletionSummary): boolean =>
  summary.totalOccurrences > 0 &&
  summary.completedOccurrences === summary.totalOccurrences;

const getCompletionRate = (summary: CompletionSummary): number => {
  if (summary.totalOccurrences === 0) {
    return 0;
  }

  return Math.round(
    (summary.completedOccurrences / summary.totalOccurrences) * 100,
  );
};

const getEarliestDateKey = (
  tasks: Task[],
  completions: DailyCompletions,
): string | null => {
  const dateKeys = [
    ...tasks.map((task) => task.startDate),
    ...Object.keys(completions),
  ];

  const parsedDates = dateKeys
    .map((dateKey) => ({ dateKey, date: parseDateKey(dateKey) }))
    .filter((entry) => entry.date !== null);

  if (!parsedDates.length) {
    return null;
  }

  parsedDates.sort((left, right) =>
    left.date && right.date ? left.date.getTime() - right.date.getTime() : 0,
  );

  return parsedDates[0]?.dateKey ?? null;
};

const buildSummaryForDate = (
  tasks: Task[],
  completions: DailyCompletions,
  dateKey: string,
): CompletionSummary => {
  return buildCompletionSummary(
    getTasksForDate(tasks, dateKey),
    completions[dateKey],
  );
};

const getCompletionRateForDays = (
  tasks: Task[],
  completions: DailyCompletions,
  today: Date,
  days: number,
): number => {
  const summary = Array.from({ length: days }, (_, index) => {
    const dateKey = formatDateKey(
      new Date(today.getTime() - index * MS_PER_DAY),
    );
    return buildSummaryForDate(tasks, completions, dateKey);
  }).reduce<CompletionSummary>(
    (accumulator, entry) => ({
      totalOccurrences: accumulator.totalOccurrences + entry.totalOccurrences,
      completedOccurrences:
        accumulator.completedOccurrences + entry.completedOccurrences,
    }),
    { totalOccurrences: 0, completedOccurrences: 0 },
  );

  return getCompletionRate(summary);
};

export const calculateStreakSummary = (
  tasks: Task[],
  completions: DailyCompletions,
  todayKey: string,
): StreakSummary => {
  const today = parseDateKey(todayKey);
  if (!today) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      last7DaysCompletion: 0,
      last30DaysCompletion: 0,
    };
  }

  const earliestDateKey = getEarliestDateKey(tasks, completions);
  if (!earliestDateKey) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      last7DaysCompletion: 0,
      last30DaysCompletion: 0,
    };
  }

  const earliestDate = parseDateKey(earliestDateKey);
  if (!earliestDate) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      last7DaysCompletion: 0,
      last30DaysCompletion: 0,
    };
  }

  const summaries: Array<{ dateKey: string; summary: CompletionSummary }> = [];

  for (
    let current = new Date(earliestDate.getTime());
    current.getTime() <= today.getTime();
    current = new Date(current.getTime() + MS_PER_DAY)
  ) {
    const dateKey = formatDateKey(current);
    summaries.push({
      dateKey,
      summary: buildSummaryForDate(tasks, completions, dateKey),
    });
  }

  let longestStreak = 0;
  let currentStreak = 0;

  for (const entry of summaries) {
    if (isCompleteDay(entry.summary)) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  let streakFromToday = 0;
  for (let index = summaries.length - 1; index >= 0; index -= 1) {
    const entry = summaries[index];
    if (!isCompleteDay(entry.summary)) {
      break;
    }
    streakFromToday += 1;
  }

  return {
    currentStreak: streakFromToday,
    longestStreak,
    last7DaysCompletion: getCompletionRateForDays(tasks, completions, today, 7),
    last30DaysCompletion: getCompletionRateForDays(
      tasks,
      completions,
      today,
      30,
    ),
  };
};
