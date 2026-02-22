export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type Frequency =
  | "daily"
  | "n-times-daily"
  | "days-of-week"
  | "nth-weekday"
  | "day-of-month"
  | "one-time-rollover";

export type DailySchedule = {
  type: "daily";
};

export type NTimesDailySchedule = {
  type: "n-times-daily";
  timesPerDay: number;
};

export type DaysOfWeekSchedule = {
  type: "days-of-week";
  days: Weekday[];
};

export type NthWeekdaySchedule = {
  type: "nth-weekday";
  weekday: Weekday;
  nth: 1 | 2 | 3 | 4 | 5 | -1;
  monthInterval?: number;
};

export type DayOfMonthSchedule = {
  type: "day-of-month";
  day: number | "last";
  monthInterval?: number;
};

export type OneTimeRolloverSchedule = {
  type: "one-time-rollover";
};

export type TaskSchedule =
  | DailySchedule
  | NTimesDailySchedule
  | DaysOfWeekSchedule
  | NthWeekdaySchedule
  | DayOfMonthSchedule
  | OneTimeRolloverSchedule;

export type Task = {
  id: string;
  title: string;
  frequency: Frequency;
  schedule: TaskSchedule;
  timesPerDay?: number;
  startDate: string;
  endDate?: string;
  maxOccurrences?: number;
};
