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
