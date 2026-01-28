"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "../types/task";
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

const buildDailyCompletion = (
  tasks: Task[],
  existing: DailyCompletion | undefined,
): DailyCompletion => {
  return Object.fromEntries(
    tasks.map((task) => [task.id, Math.max(0, existing?.[task.id] ?? 0)]),
  );
};

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<DailyCompletions>({});
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

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

  const updateCompletion = (taskId: string, value: number) => {
    if (!editable) {
      return;
    }

    setCompletions((prev) => {
      const current = prev[selectedDateKey] ?? {};
      const nextForDate = {
        ...current,
        [taskId]: Math.max(0, value),
      };
      const next = {
        ...prev,
        [selectedDateKey]: nextForDate,
      };
      writeCompletions(next);
      return next;
    });
  };

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
        <label htmlFor="date-select" style={{ display: "block" }}>
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
                    Schedule: {task.schedule.type}
                  </div>
                </div>
                <label style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.85rem" }}>Completions</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedCompletion[task.id] ?? 0}
                    onChange={(event) =>
                      updateCompletion(task.id, Number(event.target.value))
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
