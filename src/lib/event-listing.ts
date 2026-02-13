import { RaycastEvent } from "../types";

export type EventDaySection = {
  id: string;
  title: string;
  events: RaycastEvent[];
};

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
  const sortedEvents = sortEvents(events);

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

