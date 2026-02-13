import { RaycastEvent } from "../types";

export type EventDaySection = {
  id: string;
  title: string;
  events: RaycastEvent[];
};

export type TimeWindow =
  | "all_upcoming"
  | "today"
  | "today_tomorrow"
  | "next_3_days"
  | "next_7_days"
  | "this_week";

const DEFAULT_TIMEZONE = "Europe/London";

const formatDateKey = (value: Date, timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const sortEvents = (events: RaycastEvent[]): RaycastEvent[] =>
  [...events].sort((a, b) => {
    const aTime = Date.parse(a.startTime || "");
    const bTime = Date.parse(b.startTime || "");
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });

const keepUpcomingEvents = (events: RaycastEvent[]): RaycastEvent[] => {
  const nowMs = Date.now();
  return events.filter((event) => {
    const startMs = Date.parse(event.startTime || "");
    if (Number.isNaN(startMs)) return false;
    return startMs >= nowMs;
  });
};

const dateKeyForOffset = (base: Date, timezone: string, offsetDays: number): string => {
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return formatDateKey(shifted, timezone);
};

const weekdayInTimezone = (value: Date, timezone: string): number => {
  const weekdayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    weekday: "short",
  }).format(value);

  const weekdays: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return weekdays[weekdayLabel] || 1;
};

const dayLabel = (date: Date, timezone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(date);

export const formatEventTime = (startTime: string, timezone: string): string => {
  const parsed = new Date(startTime);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

export const filterEventsByTimeWindow = (
  events: RaycastEvent[],
  timezone: string,
  timeWindow: TimeWindow,
): RaycastEvent[] => {
  const now = new Date();
  if (timeWindow === "all_upcoming") {
    return keepUpcomingEvents(events);
  }
  const todayKey = formatDateKey(now, timezone);
  const allowedDateKeys = new Set<string>();

  if (timeWindow === "today") {
    allowedDateKeys.add(todayKey);
  } else if (timeWindow === "today_tomorrow") {
    allowedDateKeys.add(todayKey);
    allowedDateKeys.add(dateKeyForOffset(now, timezone, 1));
  } else if (timeWindow === "next_3_days") {
    for (let offset = 0; offset < 3; offset += 1) {
      allowedDateKeys.add(dateKeyForOffset(now, timezone, offset));
    }
  } else if (timeWindow === "next_7_days") {
    for (let offset = 0; offset < 7; offset += 1) {
      allowedDateKeys.add(dateKeyForOffset(now, timezone, offset));
    }
  } else {
    const weekday = weekdayInTimezone(now, timezone);
    const daysUntilSunday = Math.max(0, 7 - weekday);
    for (let offset = 0; offset <= daysUntilSunday; offset += 1) {
      allowedDateKeys.add(dateKeyForOffset(now, timezone, offset));
    }
  }

  return keepUpcomingEvents(events).filter((event) => {
    const parsed = new Date(event.startTime || "");
    if (Number.isNaN(parsed.getTime())) return false;
    const eventDateKey = formatDateKey(parsed, timezone);
    return allowedDateKeys.has(eventDateKey);
  });
};

export const groupEventsByDay = (
  events: RaycastEvent[],
  timezone: string,
): EventDaySection[] => {
  const now = new Date();
  const todayKey = formatDateKey(now, timezone);
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow, timezone);

  const grouped = new Map<string, EventDaySection>();
  const sortedEvents = sortEvents(keepUpcomingEvents(events));

  for (const event of sortedEvents) {
    const parsed = new Date(event.startTime || "");
    if (Number.isNaN(parsed.getTime())) continue;

    const key = formatDateKey(parsed, timezone);
    if (!grouped.has(key)) {
      const title =
        key === todayKey
          ? "Today"
          : key === tomorrowKey
            ? "Tomorrow"
            : dayLabel(parsed, timezone);
      grouped.set(key, {
        id: key,
        title,
        events: [],
      });
    }

    grouped.get(key)?.events.push(event);
  }

  return Array.from(grouped.values());
};
