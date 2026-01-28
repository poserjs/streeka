"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Task, TaskSchedule, Weekday } from "../types/task";
import { getTasksForDate } from "../lib/recurrence";
import type { DailyCompletions } from "../lib/storage";
import {
  readCompletions,
  readLastActiveDate,
  readTasks,
  writeCompletions,
  writeLastActiveDate,
} from "../lib/storage";
import {
  compareDateKeys,
  getTodayKey,
  getYesterdayKey,
  isEditableDate,
} from "../lib/dates";

type DailyCompletion = Record<string, number>;

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

const buildDailyCompletion = (
  tasks: Task[],
  existing: DailyCompletion | undefined,
): DailyCompletion => {
  return Object.fromEntries(
    tasks.map((task) => [task.id, Math.max(0, existing?.[task.id] ?? 0)]),
  );
};

const getOccurrenceCount = (task: Task): number =>
  task.schedule.type === "n-times-daily"
    ? Math.max(1, task.schedule.timesPerDay)
    : 1;

const describeSchedule = (task: Task): string => {
  if (task.endDate && task.startDate === task.endDate) {
    return `One-time on ${task.startDate}`;
  }

  const { schedule } = task;

  switch (schedule.type) {
    case "daily":
      return "Daily";
    case "n-times-daily":
      return `${schedule.timesPerDay} times per day`;
    case "days-of-week":
      return `Every ${schedule.days
        .map((day) => day[0].toUpperCase() + day.slice(1))
        .join(", ")}`;
    case "nth-weekday":
      return `${
        NTH_WEEK_OPTIONS.find((option) => option.value === schedule.nth)
          ?.label ?? "Nth"
      } ${schedule.weekday[0].toUpperCase()}${schedule.weekday.slice(1)}${
        schedule.monthInterval && schedule.monthInterval > 1
          ? ` every ${schedule.monthInterval} months`
          : ""
      }`;
    case "day-of-month":
      return `Day ${
        schedule.day === "last" ? "last" : schedule.day
      } of the month${
        schedule.monthInterval && schedule.monthInterval > 1
          ? ` every ${schedule.monthInterval} months`
          : ""
      }`;
    default:
      return "Custom schedule";
  }
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

  useEffect(() => {
    const storedTasks = readTasks();
    const storedCompletions = readCompletions();
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    const lastActive = readLastActiveDate();
    const tasksForToday = getTasksForDate(storedTasks, today);

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
      setStatusMessage(
        lastActive
          ? "New day detected — today's progress has been initialized."
          : "Today's progress has been initialized.",
      );
    } else if (Object.keys(nextTodayCompletion).length) {
      nextCompletions = {
        ...storedCompletions,
        [today]: nextTodayCompletion,
      };
      writeCompletions(nextCompletions);
      setStatusMessage("Today's progress has been refreshed.");
    }

    writeLastActiveDate(today);

    setTasks(storedTasks);
    setCompletions(nextCompletions);
    setTodayKey(today);
    setSelectedDateKey(today);
    setTaskStartDate(today);

    if (!nextCompletions[yesterday]) {
      setStatusMessage((prev) =>
        prev
          ? `${prev} Yesterday is read-only unless it was already tracked.`
          : "Yesterday is read-only unless it was already tracked.",
      );
    }
  }, []);

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
    return getTasksForDate(tasks, selectedDateKey);
  }, [selectedDateKey, tasks]);

  const selectedCompletion = completions[selectedDateKey] ?? {};
  const editable = Boolean(
    todayKey && isEditableDate(selectedDateKey, todayKey),
  );

  const todayTasks = useMemo(() => {
    if (!todayKey) {
      return [];
    }
    return getTasksForDate(tasks, todayKey);
  }, [tasks, todayKey]);

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

  const buildSchedule = (): TaskSchedule => {
    switch (scheduleType) {
      case "n-times-daily":
        return {
          type: "n-times-daily",
          timesPerDay: Math.max(1, Number(timesPerDay) || 1),
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

    const schedule = buildSchedule();
    const task: Task = {
      id: crypto.randomUUID(),
      title: taskTitle.trim(),
      frequency: schedule.type,
      schedule,
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
      frequency: "daily",
      schedule: { type: "daily" },
      startDate: todayKey,
      endDate: todayKey,
    };

    addTask(task);
    setExtraTaskTitle("");
    setStatusMessage("Extra task added for today.");
  };

  const toggleWeekday = (day: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
  };

  const todayCompletion = completions[todayKey] ?? {};

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Streeka</h1>
      <p>
        Track daily progress for your recurring tasks. Updates are allowed for
        today and yesterday only.
      </p>
      {statusMessage ? (
        <p style={{ color: "#2d6a4f" }}>{statusMessage}</p>
      ) : null}
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Create a task</h2>
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
              <option value="n-times-daily">Multiple times per day</option>
              <option value="days-of-week">Specific weekdays</option>
              <option value="nth-weekday">Nth weekday of month</option>
              <option value="day-of-month">Day of month</option>
            </select>
          </label>
          {scheduleType === "n-times-daily" ? (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Times per day
              <input
                type="number"
                min={1}
                value={timesPerDay}
                onChange={(event) => setTimesPerDay(Number(event.target.value))}
              />
            </label>
          ) : null}
          {scheduleType === "days-of-week" ? (
            <fieldset
              style={{ border: "1px solid #e0e0e0", padding: "0.75rem" }}
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
                  onChange={(event) => setNthMonthInterval(event.target.value)}
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
      </section>
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Today</h2>
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
                    borderBottom: "1px solid #e0e0e0",
                  }}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
                      {describeSchedule(task)}
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
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
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Progress history</h2>
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
        <label
          htmlFor="date-select"
          style={{ display: "block", marginTop: "0.75rem" }}
        >
          Review date
        </label>
        <select
          id="date-select"
          value={selectedDateKey}
          onChange={(event) => setSelectedDateKey(event.target.value)}
          style={{ marginTop: "0.5rem", minWidth: "200px" }}
        >
          {availableDateKeys.map((dateKey) => (
            <option key={dateKey} value={dateKey}>
              {dateKey}
              {dateKey === todayKey ? " (today)" : ""}
              {todayKey && dateKey === getYesterdayKey() ? " (yesterday)" : ""}
            </option>
          ))}
        </select>
        {!editable && selectedDateKey ? (
          <p style={{ color: "#9b2226", marginTop: "0.75rem" }}>
            Updates are locked for dates older than yesterday.
          </p>
        ) : null}
      </section>
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Tasks for {selectedDateKey}</h2>
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
                  borderBottom: "1px solid #e0e0e0",
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{task.title}</strong>
                  <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
                    Schedule: {describeSchedule(task)}
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
                    disabled={!editable}
                    style={{ width: "90px" }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
