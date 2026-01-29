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

const { calculateStreakSummary } = require("../lib/streaks");

test("streaks reset after missed days and resume from the latest run", () => {
  const tasks = [
    {
      id: "task-daily",
      title: "Daily habit",
      frequency: "daily",
      schedule: { type: "daily" },
      startDate: "2024-06-01",
    },
  ];

  const completions = {
    "2024-06-01": { "task-daily": 1 },
    "2024-06-02": { "task-daily": 1 },
    "2024-06-03": { "task-daily": 1 },
    "2024-06-05": { "task-daily": 1 },
    "2024-06-06": { "task-daily": 1 },
    "2024-06-07": { "task-daily": 1 },
  };

  const summary = calculateStreakSummary(tasks, completions, "2024-06-07");

  assert.equal(summary.currentStreak, 3);
  assert.equal(summary.longestStreak, 3);
});
