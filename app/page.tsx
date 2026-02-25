"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Task, TaskSchedule, Weekday } from "../types/task";
import { getTaskTimesPerDay, getTasksForDate } from "../lib/recurrence";
import type { DailyCompletions } from "../lib/storage";
import {
  readCompletions,
  readLastActiveDate,
  readTasks,
  writeCompletions,
  writeLastActiveDate,
  writeTasks,
} from "../lib/storage";
import {
  compareDateKeys,
  formatDateKey,
  formatDateWithWeekday,
  getTodayKey,
  getYesterdayKey,
  isEditableDate,
  parseDateKey,
} from "../lib/dates";
import { calculateStreakSummary } from "../lib/streaks";

type DailyCompletion = Record<string, number>;

type TabKey = "today" | "yesterday" | "schedule" | "history" | "progress";

type Theme = "light" | "dark";

type CompletionSummary = {
  totalOccurrences: number;
  completedOccurrences: number;
};

const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const NTH_WEEK_OPTIONS: Array<{
  value: 1 | 2 | 3 | 4 | 5 | -1;
  label: string;
}> = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: 5, label: "Fifth" },
  { value: -1, label: "Last" },
];

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "schedule", label: "Schedule" },
  { key: "history", label: "History" },
  { key: "progress", label: "Progress" },
];

const TIMES_PER_DAY_OPTIONS = Array.from({ length: 10 }, (_, index) =>
  String(index + 1),
);

const buildDailyCompletion = (
  tasks: Task[],
  existing: DailyCompletion | undefined,
): DailyCompletion => {
  return Object.fromEntries(
    tasks.map((task) => [task.id, Math.max(0, existing?.[task.id] ?? 0)]),
  );
};

const getOccurrenceCount = (task: Task): number => getTaskTimesPerDay(task);

const formatTimesPerDay = (task: Task): string => {
  const times = getTaskTimesPerDay(task);
  return times > 1 ? `${times}x per day` : "";
};

const describeSchedule = (task: Task): string => {
  if (task.endDate && task.startDate === task.endDate) {
    return `One-time on ${task.startDate}`;
  }

  const { schedule } = task;
  const timesPerDayLabel = formatTimesPerDay(task);
  const timesSuffix = timesPerDayLabel ? ` · ${timesPerDayLabel}` : "";

  switch (schedule.type) {
    case "daily":
      return `Daily${timesSuffix}`;
    case "n-times-daily":
      return `Daily${timesSuffix}`;
    case "days-of-week":
      return `Every ${schedule.days
        .map((day) => day[0].toUpperCase() + day.slice(1))
        .join(", ")}${timesSuffix}`;
    case "nth-weekday":
      return `${
        NTH_WEEK_OPTIONS.find((option) => option.value === schedule.nth)
          ?.label ?? "Nth"
      } ${schedule.weekday[0].toUpperCase()}${schedule.weekday.slice(1)}${
        schedule.monthInterval && schedule.monthInterval > 1
          ? ` every ${schedule.monthInterval} months`
          : ""
      }${timesSuffix}`;
    case "day-of-month":
      return `Day ${
        schedule.day === "last" ? "last" : schedule.day
      } of the month${
        schedule.monthInterval && schedule.monthInterval > 1
          ? ` every ${schedule.monthInterval} months`
          : ""
      }${timesSuffix}`;
    case "one-time-rollover":
      return `One-time from ${task.startDate} until completed`;
    default:
      return "Custom schedule";
  }
};

const buildCompletionSummary = (
  tasksForDate: Task[],
  completion: DailyCompletion,
): CompletionSummary => {
  return tasksForDate.reduce<CompletionSummary>(
    (summary, task) => {
      const occurrences = getOccurrenceCount(task);
      const completed = Math.min(completion[task.id] ?? 0, occurrences);
      return {
        totalOccurrences: summary.totalOccurrences + occurrences,
        completedOccurrences: summary.completedOccurrences + completed,
      };
    },
    { totalOccurrences: 0, completedOccurrences: 0 },
  );
};

const getProgressPercentage = (summary: CompletionSummary): number => {
  if (summary.totalOccurrences === 0) {
    return 0;
  }
  return Math.round(
    (summary.completedOccurrences / summary.totalOccurrences) * 100,
  );
};

const calculateTaskCurrentStreak = (
  task: Task,
  completions: DailyCompletions,
  todayKey: string,
): number => {
  const todayDate = parseDateKey(todayKey);
  const taskStartDate = parseDateKey(task.startDate);
  if (!todayDate || !taskStartDate) {
    return 0;
  }

  const taskEndDate = task.endDate ? parseDateKey(task.endDate) : null;
  const startFrom =
    taskEndDate && taskEndDate.getTime() < todayDate.getTime()
      ? taskEndDate
      : todayDate;

  let streak = 0;
  for (
    let current = new Date(startFrom.getTime());
    current.getTime() >= taskStartDate.getTime();
    current = new Date(current.getTime() - 24 * 60 * 60 * 1000)
  ) {
    const dateKey = formatDateKey(current);
    const isScheduled =
      getTasksForDate([task], dateKey, completions).length > 0;
    if (!isScheduled) {
      continue;
    }

    const occurrences = getOccurrenceCount(task);
    const completed = Math.min(
      completions[dateKey]?.[task.id] ?? 0,
      occurrences,
    );
    if (completed < occurrences) {
      break;
    }

    streak += 1;
  }

  return streak;
};

const formatTaskStreakLabel = (task: Task, streak: number): string => {
  if (streak === 0) {
    return "No streak yet";
  }

  const isDailyTask =
    task.schedule.type === "daily" || task.schedule.type === "n-times-daily";
  if (isDailyTask) {
    return `${streak} ${streak === 1 ? "day" : "days"} in a row`;
  }

  return `${streak} ${streak === 1 ? "run" : "runs"} in a row`;
};

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<DailyCompletions>({});
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [taskMaxOccurrences, setTaskMaxOccurrences] = useState("");
  const [scheduleType, setScheduleType] =
    useState<TaskSchedule["type"]>("daily");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [nthWeek, setNthWeek] = useState<1 | 2 | 3 | 4 | 5 | -1>(1);
  const [nthWeekday, setNthWeekday] = useState<Weekday>("monday");
  const [nthMonthInterval, setNthMonthInterval] = useState("1");
  const [monthDay, setMonthDay] = useState("1");
  const [monthInterval, setMonthInterval] = useState("1");
  const [extraTaskTitle, setExtraTaskTitle] = useState("");
  const [extraTaskRolloverUntilCompleted, setExtraTaskRolloverUntilCompleted] =
    useState(false);
  const [taskEdits, setTaskEdits] = useState<
    Record<string, { title: string; timesPerDay: string }>
  >({});
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedTasks = readTasks();
    const storedCompletions = readCompletions();
    const today = getTodayKey();
    const lastActive = readLastActiveDate();
    const tasksForToday = getTasksForDate(
      storedTasks,
      today,
      storedCompletions,
    );

    let nextCompletions = storedCompletions;
    const shouldInitializeToday =
      !lastActive || compareDateKeys(lastActive, today) < 0;

    const nextTodayCompletion = buildDailyCompletion(
      tasksForToday,
      storedCompletions[today],
    );

    if (shouldInitializeToday || !storedCompletions[today]) {
      nextCompletions = {
        ...storedCompletions,
        [today]: nextTodayCompletion,
      };
      writeCompletions(nextCompletions);
    } else if (Object.keys(nextTodayCompletion).length) {
      nextCompletions = {
        ...storedCompletions,
        [today]: nextTodayCompletion,
      };
      writeCompletions(nextCompletions);
    }

    writeLastActiveDate(today);

    setTasks(storedTasks);
    setCompletions(nextCompletions);
    setTodayKey(today);
    setSelectedDateKey(today);
    setTaskStartDate(today);
  }, []);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("streeka-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("streeka-theme", theme);
  }, [theme]);

  const availableDateKeys = useMemo(() => {
    const keys = Object.keys(completions);
    if (todayKey && !keys.includes(todayKey)) {
      keys.push(todayKey);
    }
    const yesterdayKey = todayKey ? getYesterdayKey() : "";
    if (yesterdayKey && !keys.includes(yesterdayKey)) {
      keys.push(yesterdayKey);
    }

    return keys.sort((left, right) => compareDateKeys(right, left));
  }, [completions, todayKey]);

  const tasksForSelectedDate = useMemo(() => {
    if (!selectedDateKey) {
      return [];
    }
    return getTasksForDate(tasks, selectedDateKey, completions);
  }, [selectedDateKey, tasks, completions]);

  const selectedCompletion = completions[selectedDateKey] ?? {};
  const editable = Boolean(
    todayKey && isEditableDate(selectedDateKey, todayKey),
  );

  const todayTasks = useMemo(() => {
    if (!todayKey) {
      return [];
    }
    return getTasksForDate(tasks, todayKey, completions);
  }, [tasks, todayKey, completions]);

  const yesterdayKey = todayKey ? getYesterdayKey() : "";

  const yesterdayTasks = useMemo(() => {
    if (!yesterdayKey) {
      return [];
    }
    return getTasksForDate(tasks, yesterdayKey, completions);
  }, [tasks, yesterdayKey, completions]);

  const updateCompletionForDate = (
    dateKey: string,
    taskId: string,
    value: number,
  ) => {
    if (!todayKey || !isEditableDate(dateKey, todayKey)) {
      return;
    }

    setCompletions((prev) => {
      const current = prev[dateKey] ?? {};
      const nextForDate = {
        ...current,
        [taskId]: Math.max(0, value),
      };
      const next = {
        ...prev,
        [dateKey]: nextForDate,
      };
      writeCompletions(next);
      return next;
    });
  };

  const ensureCompletionEntry = (
    dateKey: string,
    taskId: string,
    nextCompletions: DailyCompletions,
  ): DailyCompletions => {
    const current = nextCompletions[dateKey] ?? {};
    if (current[taskId] !== undefined) {
      return nextCompletions;
    }

    return {
      ...nextCompletions,
      [dateKey]: {
        ...current,
        [taskId]: 0,
      },
    };
  };

  const addTask = (task: Task) => {
    setTasks((prev) => {
      const next = [...prev, task];
      writeTasks(next);
      return next;
    });

    setCompletions((prev) => {
      let next = prev;
      if (todayKey) {
        next = ensureCompletionEntry(todayKey, task.id, next);
      }
      if (selectedDateKey && selectedDateKey !== todayKey) {
        next = ensureCompletionEntry(selectedDateKey, task.id, next);
      }
      writeCompletions(next);
      return next;
    });
  };

  const getTaskDraft = (task: Task): { title: string; timesPerDay: string } =>
    taskEdits[task.id] ?? {
      title: task.title,
      timesPerDay: String(getTaskTimesPerDay(task)),
    };

  const updateTaskDraft = (
    taskId: string,
    updates: Partial<{ title: string; timesPerDay: string }>,
  ) => {
    setTaskEdits((prev) => {
      const baseTask = tasks.find((task) => task.id === taskId);
      const current = prev[taskId] ?? {
        title: baseTask?.title ?? "",
        timesPerDay: String(baseTask ? getTaskTimesPerDay(baseTask) : 1),
      };
      return {
        ...prev,
        [taskId]: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const updateTask = (
    taskId: string,
    updates: { title?: string; timesPerDay?: number },
  ) => {
    setTasks((prev) => {
      const next = prev.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextTask: Task = {
          ...task,
          ...(updates.title !== undefined ? { title: updates.title } : {}),
          ...(updates.timesPerDay !== undefined
            ? { timesPerDay: updates.timesPerDay }
            : {}),
        };

        if (
          updates.timesPerDay !== undefined &&
          nextTask.schedule.type === "n-times-daily"
        ) {
          nextTask.schedule = {
            ...nextTask.schedule,
            timesPerDay: updates.timesPerDay,
          };
        }

        return nextTask;
      });
      writeTasks(next);
      return next;
    });
  };

  const saveTaskEdits = (task: Task) => {
    const draft = getTaskDraft(task);
    const nextTitle = draft.title.trim();
    if (!nextTitle) {
      setStatusMessage("Task title cannot be empty.");
      return;
    }

    const nextTimesPerDay = Math.min(
      10,
      Math.max(1, Number(draft.timesPerDay) || 1),
    );
    updateTask(task.id, {
      title: nextTitle,
      timesPerDay: nextTimesPerDay,
    });

    setTaskEdits((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setStatusMessage("Task updated.");
  };

  const removeTask = (taskId: string) => {
    setTasks((prev) => {
      const next = prev.filter((task) => task.id !== taskId);
      writeTasks(next);
      return next;
    });

    setCompletions((prev) => {
      let updated = false;
      const next = Object.fromEntries(
        Object.entries(prev).map(([dateKey, completion]) => {
          if (!Object.prototype.hasOwnProperty.call(completion, taskId)) {
            return [dateKey, completion] as const;
          }
          const { [taskId]: _, ...rest } = completion;
          updated = true;
          return [dateKey, rest] as const;
        }),
      );

      if (updated) {
        writeCompletions(next);
        return next;
      }

      return prev;
    });

    setTaskEdits((prev) => {
      if (!prev[taskId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setStatusMessage("Task removed.");
  };

  const buildSchedule = (timesPerDayValue: number): TaskSchedule => {
    switch (scheduleType) {
      case "n-times-daily":
        return {
          type: "n-times-daily",
          timesPerDay: timesPerDayValue,
        };
      case "days-of-week":
        return {
          type: "days-of-week",
          days: weekdays.length ? weekdays : ["monday"],
        };
      case "nth-weekday":
        return {
          type: "nth-weekday",
          weekday: nthWeekday,
          nth: nthWeek,
          monthInterval:
            Number(nthMonthInterval) > 1 ? Number(nthMonthInterval) : undefined,
        };
      case "day-of-month":
        return {
          type: "day-of-month",
          day: monthDay === "last" ? "last" : Math.max(1, Number(monthDay)),
          monthInterval:
            Number(monthInterval) > 1 ? Number(monthInterval) : undefined,
        };
      case "one-time-rollover":
        return { type: "one-time-rollover" };
      case "daily":
      default:
        return { type: "daily" };
    }
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskTitle.trim() || !taskStartDate) {
      setStatusMessage("Please provide a task title and start date.");
      return;
    }

    const normalizedTimesPerDay = Math.min(10, Math.max(1, timesPerDay));
    const schedule = buildSchedule(normalizedTimesPerDay);
    const task: Task = {
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      frequency: schedule.type,
      schedule,
      timesPerDay: normalizedTimesPerDay,
      startDate: taskStartDate,
      endDate: taskEndDate || undefined,
      maxOccurrences: taskMaxOccurrences
        ? Math.max(1, Number(taskMaxOccurrences))
        : undefined,
    };

    addTask(task);
    setTaskTitle("");
    setTaskEndDate("");
    setTaskMaxOccurrences("");
    setStatusMessage("Task created.");
  };

  const handleAddExtraTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extraTaskTitle.trim() || !todayKey) {
      setStatusMessage("Please add a title for the extra task.");
      return;
    }

    const task: Task = {
      id: crypto.randomUUID(),
      title: extraTaskTitle.trim(),
      frequency: extraTaskRolloverUntilCompleted
        ? "one-time-rollover"
        : "daily",
      schedule: {
        type: extraTaskRolloverUntilCompleted ? "one-time-rollover" : "daily",
      },
      timesPerDay: 1,
      startDate: todayKey,
      endDate: extraTaskRolloverUntilCompleted ? undefined : todayKey,
    };

    addTask(task);
    setExtraTaskTitle("");
    setExtraTaskRolloverUntilCompleted(false);
    setStatusMessage("Extra task added for today.");
  };

  const toggleWeekday = (day: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
  };

  const todayCompletion = useMemo(
    () => completions[todayKey] ?? {},
    [completions, todayKey],
  );
  const yesterdayCompletion = useMemo(
    () => completions[yesterdayKey] ?? {},
    [completions, yesterdayKey],
  );

  const todaySummary = useMemo(
    () => buildCompletionSummary(todayTasks, todayCompletion),
    [todayTasks, todayCompletion],
  );

  const yesterdaySummary = useMemo(
    () => buildCompletionSummary(yesterdayTasks, yesterdayCompletion),
    [yesterdayTasks, yesterdayCompletion],
  );

  const recentSummaries = useMemo(() => {
    if (!todayKey) {
      return [] as Array<{ dateKey: string; summary: CompletionSummary }>;
    }
    const todayDate = parseDateKey(todayKey);
    if (!todayDate) {
      return [] as Array<{ dateKey: string; summary: CompletionSummary }>;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    return Array.from({ length: 7 }, (_, index) => {
      const dateKey = formatDateKey(
        new Date(todayDate.getTime() - index * msPerDay),
      );
      return {
        dateKey,
        summary: buildCompletionSummary(
          getTasksForDate(tasks, dateKey, completions),
          completions[dateKey] ?? {},
        ),
      };
    });
  }, [completions, tasks, todayKey]);

  const streakSummary = useMemo(
    () => calculateStreakSummary(tasks, completions, todayKey),
    [tasks, completions, todayKey],
  );

  const taskStreaks = useMemo(() => {
    if (!todayKey) {
      return [] as Array<{ task: Task; streak: number }>;
    }

    return tasks
      .map((task) => ({
        task,
        streak: calculateTaskCurrentStreak(task, completions, todayKey),
      }))
      .sort(
        (left, right) =>
          right.streak - left.streak ||
          left.task.title.localeCompare(right.task.title),
      );
  }, [tasks, completions, todayKey]);

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "var(--bg)",
        color: "var(--text)",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Streeka</h1>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            style={{
              border: "1px solid var(--tab-border)",
              borderRadius: "999px",
              backgroundColor: "var(--tab-bg)",
              color: "var(--tab-text)",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
            }}
          >
            {theme === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>
      {statusMessage ? (
        <p style={{ color: "var(--success)" }}>{statusMessage}</p>
      ) : null}

      <nav
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginTop: "1.5rem",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "999px",
              border: "1px solid var(--tab-border)",
              backgroundColor:
                activeTab === tab.key
                  ? "var(--tab-active-bg)"
                  : "var(--tab-bg)",
              color:
                activeTab === tab.key
                  ? "var(--tab-active-text)"
                  : "var(--tab-text)",
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "today" ? (
        <section style={{ marginTop: "1.5rem" }}>
          {todayKey ? (
            <p style={{ color: "var(--text-muted)" }}>
              {formatDateWithWeekday(todayKey)}
            </p>
          ) : null}
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                padding: "0.75rem",
                border: "1px solid var(--surface-border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Completion
              </div>
              <strong>{getProgressPercentage(todaySummary)}%</strong>
            </div>
            <div
              style={{
                padding: "0.75rem",
                border: "1px solid var(--surface-border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Tasks scheduled
              </div>
              <strong>{todayTasks.length}</strong>
            </div>
          </div>
          <form
            onSubmit={handleAddExtraTask}
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <label style={{ display: "flex", flexDirection: "column" }}>
              Extra task for today only
              <input
                type="text"
                value={extraTaskTitle}
                onChange={(event) => setExtraTaskTitle(event.target.value)}
                placeholder="Add a one-time task"
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                marginTop: "1.2rem",
              }}
            >
              <input
                type="checkbox"
                checked={extraTaskRolloverUntilCompleted}
                onChange={(event) =>
                  setExtraTaskRolloverUntilCompleted(event.target.checked)
                }
              />
              Rollover until completed
            </label>
            <button type="submit">Add extra</button>
          </form>
          {todayTasks.length === 0 ? (
            <p>No tasks scheduled for today.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem" }}>
              {todayTasks.map((task) => {
                const occurrences = getOccurrenceCount(task);
                const completed = todayCompletion[task.id] ?? 0;

                return (
                  <li
                    key={task.id}
                    style={{
                      display: "grid",
                      gap: "0.5rem",
                      padding: "0.75rem 0",
                      borderBottom: "1px solid var(--surface-border)",
                    }}
                  >
                    <div>
                      <strong>{task.title}</strong>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {describeSchedule(task)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {Array.from({ length: occurrences }, (_, index) => {
                        const checkboxId = `${task.id}-occurrence-${index}`;
                        const isChecked = index < completed;
                        return (
                          <label
                            key={checkboxId}
                            htmlFor={checkboxId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                            }}
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={isChecked}
                              disabled={!isEditableDate(todayKey, todayKey)}
                              onChange={(event) =>
                                updateCompletionForDate(
                                  todayKey,
                                  task.id,
                                  event.target.checked ? index + 1 : index,
                                )
                              }
                            />
                            {occurrences > 1 ? `#${index + 1}` : "Done"}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "yesterday" ? (
        <section style={{ marginTop: "1.5rem" }}>
          {yesterdayKey ? (
            <p style={{ color: "var(--text-muted)" }}>
              {formatDateWithWeekday(yesterdayKey)}
            </p>
          ) : null}
          {yesterdayTasks.length === 0 ? (
            <p>No tasks scheduled for yesterday.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {yesterdayTasks.map((task) => {
                const occurrences = getOccurrenceCount(task);
                const completed = yesterdayCompletion[task.id] ?? 0;

                return (
                  <li
                    key={task.id}
                    style={{
                      display: "grid",
                      gap: "0.5rem",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--surface-border)",
                    }}
                  >
                    <div>
                      <strong>{task.title}</strong>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {describeSchedule(task)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {Array.from({ length: occurrences }, (_, index) => {
                        const checkboxId = `${task.id}-yesterday-occurrence-${index}`;
                        const isChecked = index < completed;
                        return (
                          <label
                            key={checkboxId}
                            htmlFor={checkboxId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                            }}
                          >
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={isChecked}
                              disabled={!isEditableDate(yesterdayKey, todayKey)}
                              onChange={(event) =>
                                updateCompletionForDate(
                                  yesterdayKey,
                                  task.id,
                                  event.target.checked ? index + 1 : index,
                                )
                              }
                            />
                            {occurrences > 1 ? `#${index + 1}` : "Done"}
                          </label>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!isEditableDate(yesterdayKey, todayKey) ? (
            <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>
              Updates are locked for dates older than yesterday.
            </p>
          ) : null}
          {yesterdayTasks.length ? (
            <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>
              Completion: {getProgressPercentage(yesterdaySummary)}%
            </p>
          ) : null}
        </section>
      ) : null}

      {activeTab === "schedule" ? (
        <section style={{ marginTop: "1.5rem" }}>
          <form
            onSubmit={handleCreateTask}
            style={{
              display: "grid",
              gap: "0.75rem",
              maxWidth: "500px",
            }}
          >
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Task title
              <input
                type="text"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="e.g. Stretching"
                required
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Start date
              <input
                type="date"
                value={taskStartDate}
                onChange={(event) => setTaskStartDate(event.target.value)}
                required
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              End date (optional)
              <input
                type="date"
                value={taskEndDate}
                onChange={(event) => setTaskEndDate(event.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Max occurrences (optional)
              <input
                type="number"
                min={1}
                value={taskMaxOccurrences}
                onChange={(event) => setTaskMaxOccurrences(event.target.value)}
                placeholder="Leave blank for unlimited"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Recurrence
              <select
                value={scheduleType}
                onChange={(event) =>
                  setScheduleType(event.target.value as TaskSchedule["type"])
                }
              >
                <option value="daily">Daily</option>
                <option value="days-of-week">Specific weekdays</option>
                <option value="nth-weekday">Nth weekday of month</option>
                <option value="day-of-month">Day of month</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Times per day
              <select
                value={timesPerDay}
                onChange={(event) => setTimesPerDay(Number(event.target.value))}
              >
                {TIMES_PER_DAY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {scheduleType === "days-of-week" ? (
              <fieldset
                style={{
                  border: "1px solid var(--surface-border)",
                  padding: "0.75rem",
                }}
              >
                <legend>Select weekdays</legend>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "0.5rem",
                  }}
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: "flex",
                        gap: "0.35rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={weekdays.includes(option.value)}
                        onChange={() => toggleWeekday(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {scheduleType === "nth-weekday" ? (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  Week of month
                  <select
                    value={nthWeek}
                    onChange={(event) =>
                      setNthWeek(
                        Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | -1,
                      )
                    }
                  >
                    {NTH_WEEK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  Weekday
                  <select
                    value={nthWeekday}
                    onChange={(event) =>
                      setNthWeekday(event.target.value as Weekday)
                    }
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  Month interval
                  <input
                    type="number"
                    min={1}
                    value={nthMonthInterval}
                    onChange={(event) =>
                      setNthMonthInterval(event.target.value)
                    }
                  />
                </label>
              </div>
            ) : null}
            {scheduleType === "day-of-month" ? (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  Day of month
                  <select
                    value={monthDay}
                    onChange={(event) => setMonthDay(event.target.value)}
                  >
                    {Array.from({ length: 28 }, (_, index) => index + 1).map(
                      (day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ),
                    )}
                    <option value="last">Last day</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  Month interval
                  <input
                    type="number"
                    min={1}
                    value={monthInterval}
                    onChange={(event) => setMonthInterval(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <button type="submit" style={{ width: "fit-content" }}>
              Add task
            </button>
          </form>
          <div style={{ marginTop: "1.5rem" }}>
            {tasks.filter((task) => task.schedule.type !== "one-time-rollover")
              .length === 0 ? (
              <p>No tasks yet. Add your first habit above.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {tasks
                  .filter((task) => task.schedule.type !== "one-time-rollover")
                  .map((task) => {
                    const draft = getTaskDraft(task);
                    const draftTimes = Math.max(
                      1,
                      Number(draft.timesPerDay) || 1,
                    );
                    const currentTimes = getTaskTimesPerDay(task);
                    const hasChanges =
                      draft.title.trim() !== task.title ||
                      draftTimes !== currentTimes;

                    return (
                      <li
                        key={task.id}
                        style={{
                          padding: "0.75rem 0",
                          borderBottom: "1px solid var(--surface-border)",
                          display: "grid",
                          gap: "0.5rem",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gap: "0.5rem",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(200px, 1fr))",
                            alignItems: "end",
                          }}
                        >
                          <label style={{ display: "grid", gap: "0.35rem" }}>
                            Title
                            <input
                              type="text"
                              value={draft.title}
                              onChange={(event) =>
                                updateTaskDraft(task.id, {
                                  title: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label style={{ display: "grid", gap: "0.35rem" }}>
                            Times per day
                            <select
                              value={draft.timesPerDay}
                              onChange={(event) =>
                                updateTaskDraft(task.id, {
                                  timesPerDay: event.target.value,
                                })
                              }
                            >
                              {TIMES_PER_DAY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => saveTaskEdits(task)}
                              disabled={!hasChanges}
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTask(task.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          {describeSchedule(task)}
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          Active from {task.startDate}
                          {task.endDate ? ` to ${task.endDate}` : ""}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "history" ? (
        <section style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setSelectedDateKey(todayKey)}>
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDateKey(getYesterdayKey())}
            >
              Yesterday
            </button>
          </div>
          <select
            id="date-select"
            aria-label="Review date"
            value={selectedDateKey}
            onChange={(event) => setSelectedDateKey(event.target.value)}
            style={{ marginTop: "0.75rem", minWidth: "200px" }}
          >
            {availableDateKeys.map((dateKey) => (
              <option key={dateKey} value={dateKey}>
                {dateKey}
                {dateKey === todayKey ? " (today)" : ""}
                {todayKey && dateKey === getYesterdayKey()
                  ? " (yesterday)"
                  : ""}
              </option>
            ))}
          </select>
          {!editable && selectedDateKey ? (
            <p style={{ color: "var(--danger)", marginTop: "0.75rem" }}>
              Updates are locked for dates older than yesterday.
            </p>
          ) : null}
          <div style={{ marginTop: "1.5rem" }}>
            {tasksForSelectedDate.length === 0 ? (
              <p>No tasks scheduled for this date.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {tasksForSelectedDate.map((task) => (
                  <li
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--surface-border)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong>{task.title}</strong>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {describeSchedule(task)}
                      </div>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: "0.85rem" }}>Completions</span>
                      <input
                        type="number"
                        min={0}
                        value={selectedCompletion[task.id] ?? 0}
                        onChange={(event) =>
                          updateCompletionForDate(
                            selectedDateKey,
                            task.id,
                            Number(event.target.value),
                          )
                        }
                        onFocus={(event) => event.target.select()}
                        disabled={!editable}
                        style={{ width: "90px" }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "progress" ? (
        <section style={{ marginTop: "1.5rem" }}>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div
              style={{
                padding: "0.75rem",
                border: "1px solid var(--surface-border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Today completion
              </div>
              <strong>{getProgressPercentage(todaySummary)}%</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {todaySummary.completedOccurrences} of{" "}
                {todaySummary.totalOccurrences}
              </div>
            </div>
            <div
              style={{
                padding: "0.75rem",
                border: "1px solid var(--surface-border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Yesterday completion
              </div>
              <strong>{getProgressPercentage(yesterdaySummary)}%</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {yesterdaySummary.completedOccurrences} of{" "}
                {yesterdaySummary.totalOccurrences}
              </div>
            </div>
            <div
              style={{
                padding: "0.75rem",
                border: "1px solid var(--surface-border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Last 7 days completion
              </div>
              <strong>{streakSummary.last7DaysCompletion}%</strong>
            </div>
          </div>
          <div style={{ marginTop: "1.5rem" }}>
            {taskStreaks.length === 0 ? (
              <p>No tasks yet.</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  marginBottom: "1.5rem",
                }}
              >
                {taskStreaks.map(({ task, streak }) => (
                  <li
                    key={task.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--surface-border)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                    }}
                  >
                    <span>{task.title}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {formatTaskStreakLabel(task, streak)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ marginTop: "1.5rem" }}>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {recentSummaries.map((entry) => (
                <li
                  key={entry.dateKey}
                  style={{
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--surface-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <span>{entry.dateKey}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {getProgressPercentage(entry.summary)}% (
                    {entry.summary.completedOccurrences}/
                    {entry.summary.totalOccurrences})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
