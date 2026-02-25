const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { getTasksForDate } = require("../lib/recurrence");

test("recurrence includes tasks on the last day of the month", () => {
  const tasks = [
    {
      id: "task-last-day",
      title: "Pay rent",
      frequency: "day-of-month",
      schedule: { type: "day-of-month", day: "last" },
      startDate: "2024-01-01",
    },
  ];

  const februaryLast = getTasksForDate(tasks, "2024-02-29");
  const februaryNotLast = getTasksForDate(tasks, "2024-02-28");
  const aprilLast = getTasksForDate(tasks, "2024-04-30");

  assert.equal(februaryLast.length, 1);
  assert.equal(februaryNotLast.length, 0);
  assert.equal(aprilLast.length, 1);
});

test("recurrence handles nth-weekday schedules on edge weeks", () => {
  const tasks = [
    {
      id: "task-last-friday",
      title: "Monthly report",
      frequency: "nth-weekday",
      schedule: { type: "nth-weekday", weekday: "friday", nth: -1 },
      startDate: "2024-01-01",
    },
  ];

  const lastFriday = getTasksForDate(tasks, "2024-05-31");
  const notLastFriday = getTasksForDate(tasks, "2024-05-24");

  assert.equal(lastFriday.length, 1);
  assert.equal(notLastFriday.length, 0);
});

test("one-time rollover tasks remain scheduled after start date", () => {
  const tasks = [
    {
      id: "task-rollover",
      title: "One-time cleanup",
      frequency: "one-time-rollover",
      schedule: { type: "one-time-rollover" },
      startDate: "2024-01-10",
    },
  ];

  const beforeStart = getTasksForDate(tasks, "2024-01-09");
  const onStart = getTasksForDate(tasks, "2024-01-10");
  const afterStart = getTasksForDate(tasks, "2024-04-01");

  assert.equal(beforeStart.length, 0);
  assert.equal(onStart.length, 1);
  assert.equal(afterStart.length, 1);
});

test("one-time rollover tasks stop after completion date", () => {
  const tasks = [
    {
      id: "task-rollover-complete",
      title: "One-time cleanup",
      frequency: "one-time-rollover",
      schedule: { type: "one-time-rollover" },
      timesPerDay: 1,
      startDate: "2024-01-10",
    },
  ];

  const completions = {
    "2024-01-12": {
      "task-rollover-complete": 1,
    },
  };

  const beforeCompletion = getTasksForDate(tasks, "2024-01-11", completions);
  const onCompletion = getTasksForDate(tasks, "2024-01-12", completions);
  const afterCompletion = getTasksForDate(tasks, "2024-01-13", completions);

  assert.equal(beforeCompletion.length, 1);
  assert.equal(onCompletion.length, 1);
  assert.equal(afterCompletion.length, 0);
});
