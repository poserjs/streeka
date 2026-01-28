import type { Task } from "../types/task";

type DailyCompletion = Record<string, number>;
export type DailyCompletions = Record<string, DailyCompletion>;

type StoredTasksV1 = {
  version: 1;
  tasks: Task[];
};

type StoredCompletionsV1 = {
  version: 1;
  completions: DailyCompletions;
};

const TASKS_STORAGE_KEY = "streeka.tasks";
const COMPLETIONS_STORAGE_KEY = "streeka.completions";
const LAST_ACTIVE_DATE_KEY = "streeka.lastActiveDate";

const CURRENT_TASKS_VERSION = 1;
const CURRENT_COMPLETIONS_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

const sanitizeCompletion = (value: unknown): DailyCompletion => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([taskId, count]) => {
      if (typeof count === "number" && Number.isFinite(count)) {
        return [[taskId, Math.max(0, count)]] as const;
      }

      if (typeof count === "boolean") {
        return [[taskId, count ? 1 : 0]] as const;
      }

      return [] as const;
    }),
  );
};

const sanitizeCompletions = (value: unknown): DailyCompletions => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([date, completion]) => [
      date,
      sanitizeCompletion(completion),
    ]),
  );
};

const migrateTasks = (
  value: unknown,
): { data: StoredTasksV1; needsWrite: boolean } => {
  if (
    isRecord(value) &&
    value.version === CURRENT_TASKS_VERSION &&
    Array.isArray(value.tasks)
  ) {
    return {
      data: value as StoredTasksV1,
      needsWrite: false,
    };
  }

  if (Array.isArray(value)) {
    return {
      data: {
        version: CURRENT_TASKS_VERSION,
        tasks: value as Task[],
      },
      needsWrite: true,
    };
  }

  return {
    data: {
      version: CURRENT_TASKS_VERSION,
      tasks: [],
    },
    needsWrite: true,
  };
};

const migrateCompletions = (
  value: unknown,
): { data: StoredCompletionsV1; needsWrite: boolean } => {
  if (
    isRecord(value) &&
    value.version === CURRENT_COMPLETIONS_VERSION &&
    isRecord(value.completions)
  ) {
    return {
      data: {
        version: CURRENT_COMPLETIONS_VERSION,
        completions: sanitizeCompletions(value.completions),
      },
      needsWrite: false,
    };
  }

  if (isRecord(value)) {
    return {
      data: {
        version: CURRENT_COMPLETIONS_VERSION,
        completions: sanitizeCompletions(value),
      },
      needsWrite: true,
    };
  }

  return {
    data: {
      version: CURRENT_COMPLETIONS_VERSION,
      completions: {},
    },
    needsWrite: true,
  };
};

export const readTasks = (): Task[] => {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(TASKS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  const parsed = parseJson(raw);
  const { data, needsWrite } = migrateTasks(parsed);

  if (needsWrite) {
    storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(data));
  }

  return data.tasks;
};

export const writeTasks = (tasks: Task[]): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: StoredTasksV1 = {
    version: CURRENT_TASKS_VERSION,
    tasks,
  };

  storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(payload));
};

export const readCompletions = (): DailyCompletions => {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(COMPLETIONS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  const parsed = parseJson(raw);
  const { data, needsWrite } = migrateCompletions(parsed);

  if (needsWrite) {
    storage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(data));
  }

  return data.completions;
};

export const writeCompletions = (completions: DailyCompletions): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: StoredCompletionsV1 = {
    version: CURRENT_COMPLETIONS_VERSION,
    completions,
  };

  storage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(payload));
};

export const readLastActiveDate = (): string | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const value = storage.getItem(LAST_ACTIVE_DATE_KEY);
  if (!value) {
    return null;
  }

  return value;
};

export const writeLastActiveDate = (dateKey: string): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(LAST_ACTIVE_DATE_KEY, dateKey);
};
