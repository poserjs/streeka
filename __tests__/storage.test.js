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

const {
  readTasks,
  readCompletions,
  readLastActiveDate,
} = require("../lib/storage");

const createStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
};

test("readTasks migrates legacy tasks key", () => {
  const localStorage = createStorage({
    tasks: JSON.stringify([
      {
        id: "1",
        title: "Legacy",
        schedule: { type: "daily" },
        startDate: "2026-01-01",
      },
    ]),
  });

  global.window = { localStorage };

  const tasks = readTasks();

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Legacy");
  assert.equal(typeof localStorage.getItem("streeka.tasks"), "string");
});

test("readCompletions migrates legacy completions key", () => {
  const localStorage = createStorage({
    dailyCompletions: JSON.stringify({ "2026-01-01": { task1: 2 } }),
  });

  global.window = { localStorage };

  const completions = readCompletions();

  assert.equal(completions["2026-01-01"].task1, 2);
  assert.equal(typeof localStorage.getItem("streeka.completions"), "string");
});

test("readLastActiveDate reads legacy key", () => {
  const localStorage = createStorage({
    "streeka.last-active-date": "2026-01-01",
  });

  global.window = { localStorage };

  assert.equal(readLastActiveDate(), "2026-01-01");
});
