import {
  Action,
  ActionPanel,
  Icon,
  LaunchProps,
  List,
  LocalStorage,
  getPreferenceValues,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  filterEventsByTimeWindow,
  formatEventTime,
  groupEventsByDay,
  TimeWindow,
} from "./lib/event-listing";
import { buildGroundedSummary } from "./lib/grounded-summary";
import { QUICK_QUERY_PRESETS } from "./lib/query-presets";
import { askTownspot, sanitizeTownSlug } from "./lib/townspot";
import { ActiveZoneOption, fetchActiveZones } from "./lib/zones";
import { RaycastResponse } from "./types";
import { EventDetailView } from "./views/event-detail-view";

type AskArguments = {
  query?: string;
  townSlug?: string;
};

type Preferences = {
  apiBaseUrl: string;
  locale: string;
};

const DEFAULT_QUERY = "";
const FALLBACK_API_QUERY = "what's on this week";
const HOME_ZONE_STORAGE_KEY = "townspot-home-zone-id";
const NO_ZONE_VALUE = "__unset__";
const ZONE_VALUE_PREFIX = "zone:";

const sanitizeQuery = (value: string | undefined): string => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : DEFAULT_QUERY;
};

const useDebouncedValue = <T,>(value: T, waitMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), waitMs);
    return () => clearTimeout(timeout);
  }, [value, waitMs]);

  return debounced;
};

const hasUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const normalizeEventUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(/^\/event\/([^/]+)$/i);
    if (!match) return rawUrl;

    const slugOrUuid = match[1];
    if (hasUuid(slugOrUuid)) return rawUrl;
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slugOrUuid)) {
      return rawUrl;
    }

    return `${parsed.origin}/${slugOrUuid}`;
  } catch {
    return rawUrl;
  }
};

const toZoneValue = (id: number): string => `${ZONE_VALUE_PREFIX}${id}`;

const parseZoneId = (value: string): number | null => {
  if (!value.startsWith(ZONE_VALUE_PREFIX)) return null;
  const id = Number(value.slice(ZONE_VALUE_PREFIX.length));
  if (!Number.isFinite(id)) return null;
  return id;
};

const toCategoriesLabel = (tags: string[]): string =>
  tags
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

const CATEGORY_ALL = "All";
const DEFAULT_TIME_WINDOW: TimeWindow = "today_tomorrow";

type TimeWindowOption = {
  id: TimeWindow;
  title: string;
  queryHint: string;
};

const TIME_WINDOW_OPTIONS: TimeWindowOption[] = [
  { id: "all_upcoming", title: "All Upcoming", queryHint: "what's on this week" },
  { id: "today", title: "Today", queryHint: "what's on today" },
  {
    id: "today_tomorrow",
    title: "Today + Tomorrow",
    queryHint: "what's on today and tomorrow",
  },
  { id: "next_3_days", title: "Next 3 Days", queryHint: "what's on over the next 3 days" },
  { id: "next_7_days", title: "Next 7 Days", queryHint: "what's on over the next 7 days" },
  { id: "this_week", title: "This Week", queryHint: "what's on this week" },
];

const normalizeCategory = (value: string): string =>
  value.trim().toLowerCase();

const timeWindowLabel = (value: TimeWindow): string =>
  TIME_WINDOW_OPTIONS.find((option) => option.id === value)?.title || "Today + Tomorrow";

const eventMatchesCategory = (tags: string[], selectedCategory: string): boolean => {
  if (selectedCategory === CATEGORY_ALL) return true;
  const normalizedSelected = normalizeCategory(selectedCategory);
  const normalizedTags = tags.map((tag) => normalizeCategory(tag));
  if (normalizedSelected === "kids") {
    return normalizedTags.includes("kids") || normalizedTags.includes("family");
  }
  return normalizedTags.includes(normalizedSelected);
};

export default function Command(
  props: LaunchProps<{ arguments: AskArguments }>,
): JSX.Element {
  const preferences = getPreferenceValues<Preferences>();
  const initialTownSlug = sanitizeTownSlug(props.arguments.townSlug || "");
  const initialQuery = sanitizeQuery(props.arguments.query);

  const [zones, setZones] = useState<ActiveZoneOption[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState("");
  const [homeZoneLoading, setHomeZoneLoading] = useState(true);
  const [homeZoneId, setHomeZoneId] = useState<number | null>(null);
  const [selectedTownValue, setSelectedTownValue] = useState(NO_ZONE_VALUE);
  const [searchText, setSearchText] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<RaycastResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORY_ALL);
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<TimeWindow>(DEFAULT_TIME_WINDOW);

  const debouncedSearchText = useDebouncedValue(searchText, 350);
  const queryForApi = useMemo(() => {
    const trimmed = debouncedSearchText.trim();
    return trimmed || FALLBACK_API_QUERY;
  }, [debouncedSearchText]);

  useEffect(() => {
    let cancelled = false;

    const loadHomeZone = async () => {
      setHomeZoneLoading(true);
      try {
        const stored = await LocalStorage.getItem<string>(HOME_ZONE_STORAGE_KEY);
        if (cancelled) return;
        const parsed = Number(stored || "");
        if (Number.isFinite(parsed)) {
          setHomeZoneId(parsed);
        } else {
          setHomeZoneId(null);
        }
      } finally {
        if (!cancelled) {
          setHomeZoneLoading(false);
        }
      }
    };

    void loadHomeZone();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadZones = async () => {
      setZonesLoading(true);
      setZonesError("");
      try {
        const activeZones = await fetchActiveZones(
          preferences.apiBaseUrl,
        );
        if (cancelled) return;
        setZones(activeZones);
      } catch (error) {
        if (cancelled) return;
        setZones([]);
        setZonesError(
          error instanceof Error ? error.message : "Unable to load active towns",
        );
      } finally {
        if (!cancelled) {
          setZonesLoading(false);
        }
      }
    };

    void loadZones();

    return () => {
      cancelled = true;
    };
  }, [preferences.apiBaseUrl, preferences.locale]);

  useEffect(() => {
    if (homeZoneLoading || zonesLoading) return;

    const selectedZoneId = parseZoneId(selectedTownValue);
    if (selectedZoneId !== null) {
      const exists = zones.some((zone) => zone.id === selectedZoneId);
      if (!exists) {
        setSelectedTownValue(NO_ZONE_VALUE);
      }
      return;
    }

    if (initialTownSlug) {
      const argumentZone = zones.find((zone) => zone.slug === initialTownSlug);
      if (argumentZone) {
        setSelectedTownValue(toZoneValue(argumentZone.id));
        setHomeZoneId(argumentZone.id);
        void LocalStorage.setItem(HOME_ZONE_STORAGE_KEY, String(argumentZone.id));
        return;
      }
    }

    if (homeZoneId !== null) {
      const storedHomeZone = zones.find((zone) => zone.id === homeZoneId);
      if (storedHomeZone) {
        setSelectedTownValue(toZoneValue(storedHomeZone.id));
        return;
      }
      setHomeZoneId(null);
      void LocalStorage.removeItem(HOME_ZONE_STORAGE_KEY);
    }
  }, [homeZoneLoading, zonesLoading, zones, selectedTownValue, initialTownSlug, homeZoneId]);

  const selectedZone = useMemo(
    () => {
      const selectedZoneId = parseZoneId(selectedTownValue);
      if (selectedZoneId === null) return undefined;
      return zones.find((zone) => zone.id === selectedZoneId);
    },
    [selectedTownValue, zones],
  );

  const needsHomeZone = !selectedZone;
  const effectiveTownSlug = selectedZone?.slug || "";

  useEffect(() => {
    if (!effectiveTownSlug) {
      setResponse(null);
      setErrorMessage("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const runQuery = async () => {
      setLoading(true);
      setErrorMessage("");
      setResponse(null);

      try {
        const result = await askTownspot({
          query: queryForApi,
          townSlug: effectiveTownSlug,
          locale: preferences.locale,
          apiBaseUrl: preferences.apiBaseUrl,
          limit: 20,
          conversation: [],
        });
        if (cancelled) return;
        setResponse(result);
      } catch (error) {
        if (cancelled) return;
        setResponse(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to reach TownSpot",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void runQuery();

    return () => {
      cancelled = true;
    };
  }, [
    queryForApi,
    preferences.apiBaseUrl,
    preferences.locale,
    effectiveTownSlug,
  ]);

  const activeTownName = selectedZone?.name || "Home Zone";
  const activeTownSlug = effectiveTownSlug || "";
  const activeTimezone =
    response?.town?.slug === activeTownSlug ? response?.town?.timezone || "" : "";

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const event of response?.events || []) {
      for (const tag of event.tags || []) {
        const value = String(tag || "").trim();
        if (!value) continue;
        values.add(value);
      }
    }

    const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
    const hasKids = sorted.some((value) => normalizeCategory(value) === "kids");
    const hasFamily = sorted.some((value) => normalizeCategory(value) === "family");
    if (!hasKids && hasFamily) {
      sorted.unshift("Kids");
    }
    return [CATEGORY_ALL, ...sorted];
  }, [response]);

  const categoryFilteredEvents = useMemo(
    () =>
      (response?.events || []).filter((event) =>
        eventMatchesCategory(event.tags || [], selectedCategory),
      ),
    [response, selectedCategory],
  );

  useEffect(() => {
    if (categoryOptions.includes(selectedCategory)) return;
    setSelectedCategory(CATEGORY_ALL);
  }, [categoryOptions, selectedCategory]);

  const sectionTimezone = response?.town?.timezone || "Europe/London";
  const timeWindowEvents = useMemo(
    () =>
      filterEventsByTimeWindow(
        categoryFilteredEvents,
        sectionTimezone,
        selectedTimeWindow,
      ),
    [categoryFilteredEvents, sectionTimezone, selectedTimeWindow],
  );

  const summary = useMemo(
    () =>
      buildGroundedSummary({
        townName: activeTownName,
        query: queryForApi,
        events: timeWindowEvents,
      }),
    [activeTownName, queryForApi, timeWindowEvents],
  );

  const daySections = useMemo(
    () => groupEventsByDay(timeWindowEvents, sectionTimezone),
    [timeWindowEvents, sectionTimezone],
  );

  const setHomeZone = async (zone: ActiveZoneOption): Promise<void> => {
    setSelectedTownValue(toZoneValue(zone.id));
    setHomeZoneId(zone.id);
    await LocalStorage.setItem(HOME_ZONE_STORAGE_KEY, String(zone.id));
  };

  const onHomeZoneChange = async (value: string): Promise<void> => {
    if (value === NO_ZONE_VALUE) return;
    const zoneId = parseZoneId(value);
    if (zoneId === null) return;
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    await setHomeZone(zone);
  };

  const resetHomeZone = async (): Promise<void> => {
    setSelectedTownValue(NO_ZONE_VALUE);
    setHomeZoneId(null);
    setResponse(null);
    await LocalStorage.removeItem(HOME_ZONE_STORAGE_KEY);
  };

  return (
    <List
      isLoading={loading || zonesLoading || homeZoneLoading}
      searchBarPlaceholder={
        needsHomeZone
          ? "Set your Home Zone from the dropdown to start"
          : "Ask naturally: tonight, weekend, kids events, free events..."
      }
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Home Zone"
          value={selectedTownValue}
          onChange={(value) => {
            void onHomeZoneChange(value);
          }}
        >
          <List.Dropdown.Item
            value={NO_ZONE_VALUE}
            title={needsHomeZone ? "Set Home Zone..." : "Change Home Zone..."}
            icon={Icon.Pin}
          />
          <List.Dropdown.Section title="Active Towns">
            {zones.map((zone) => (
              <List.Dropdown.Item
                key={zone.id}
                value={toZoneValue(zone.id)}
                title={zone.name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
      throttle
    >
      {needsHomeZone ? (
        <List.Section title="Setup">
          <List.Item
            title="Set your Home Zone to continue"
            subtitle={
              zonesLoading
                ? "Loading active towns..."
                : "Open the Home Zone dropdown above and choose your Town."
            }
            icon={Icon.Pin}
            actions={
              <ActionPanel>
                {zones.map((zone) => (
                  <Action
                    key={zone.id}
                    title={`Set Home Zone: ${zone.name}`}
                    onAction={() => {
                      void setHomeZone(zone);
                    }}
                  />
                ))}
              </ActionPanel>
            }
          />
        </List.Section>
      ) : (
        <>
          <List.Section title="Filters">
            <List.Item
              title="When"
              subtitle={`${timeWindowLabel(selectedTimeWindow)}. Press Enter to switch quickly.`}
              icon={Icon.Clock}
              accessories={[{ text: `${timeWindowEvents.length} events` }]}
              actions={
                <ActionPanel>
                  {TIME_WINDOW_OPTIONS.map((option) => (
                    <Action
                      key={option.id}
                      title={`Show ${option.title}`}
                      onAction={() => {
                        setSelectedTimeWindow(option.id);
                        setSearchText(option.queryHint);
                      }}
                    />
                  ))}
                </ActionPanel>
              }
            />
            <List.Item
              title="Filter by Category"
              subtitle={
                selectedCategory === CATEGORY_ALL
                  ? "All categories. Press Enter to choose (Kids, Music, Free, ...)"
                  : `${selectedCategory}. Press Enter to change.`
              }
              icon={Icon.Tag}
              accessories={[
                { text: selectedCategory },
                { text: `${timeWindowEvents.length} results` },
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Show All Categories"
                    onAction={() => setSelectedCategory(CATEGORY_ALL)}
                  />
                  {categoryOptions
                    .filter((category) => category !== CATEGORY_ALL)
                    .map((category) => (
                    <Action
                      key={category}
                      title={`Show ${category}`}
                      onAction={() => setSelectedCategory(category)}
                    />
                  ))}
                </ActionPanel>
              }
            />
          </List.Section>

          {daySections.length ? (
            daySections.map((section) => (
              <List.Section key={section.id} title={section.title}>
                {section.events.map((event) => {
                  const normalizedEventUrl = normalizeEventUrl(event.url);
                  const timeLabel = formatEventTime(event.startTime, sectionTimezone);
                  const categoriesLabel = toCategoriesLabel(event.tags);
                  const subtitleBase = event.venueName || activeTownName;
                  const subtitle = categoriesLabel
                    ? `${subtitleBase} · ${categoriesLabel}`
                    : subtitleBase;

                  return (
                    <List.Item
                      key={event.id}
                      title={event.title}
                      subtitle={subtitle}
                      icon={{ source: "icon.png" }}
                      accessories={timeLabel ? [{ text: timeLabel }] : []}
                      actions={
                        <ActionPanel>
                          <Action.Push
                            title="View Event Details"
                            target={
                              <EventDetailView
                                event={event}
                                timezone={sectionTimezone}
                                url={normalizedEventUrl}
                                apiBaseUrl={preferences.apiBaseUrl}
                              />
                            }
                          />
                          <Action.OpenInBrowser
                            title="Open on Website"
                            url={normalizedEventUrl}
                          />
                          <Action.CopyToClipboard
                            title="Copy Event Link"
                            content={normalizedEventUrl}
                          />
                        </ActionPanel>
                      }
                    />
                  );
                })}
              </List.Section>
            ))
          ) : (
            <List.Section title="Today">
              <List.Item
                title="No events for this search"
                subtitle="Try broadening your query or switch to another time window."
                icon={Icon.Calendar}
                actions={
                  <ActionPanel>
                    <Action
                      title="Show All Upcoming"
                      onAction={() => setSelectedTimeWindow("all_upcoming")}
                    />
                    <Action
                      title="Search This Weekend"
                      onAction={() => setSearchText("what's on this weekend")}
                    />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}

          <List.Section title="Home Zone">
            <List.Item
              title={`Home Zone: ${activeTownName}`}
              subtitle={activeTownSlug || "not set"}
              icon={{ source: "icon.png" }}
              accessories={[
                { text: `${zones.length} active` },
                ...(activeTimezone ? [{ text: activeTimezone }] : []),
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Reset Home Zone"
                    onAction={() => {
                      void resetHomeZone();
                    }}
                    icon={Icon.XMarkCircle}
                  />
                  <Action
                    title="Use Kids and Family Query"
                    onAction={() => setSearchText("kids and family events this weekend")}
                    icon={Icon.Person}
                  />
                  <Action.CopyToClipboard
                    title="Copy Town Slug"
                    content={activeTownSlug}
                  />
                </ActionPanel>
              }
            />
            <List.Item
              title={summary.title}
              subtitle={summary.subtitle}
              icon={Icon.Stars}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Summary"
                    content={`${summary.title}. ${summary.subtitle}`}
                  />
                </ActionPanel>
              }
            />
          </List.Section>

          <List.Section title="Quick Searches">
            {QUICK_QUERY_PRESETS.map((preset) => (
              <List.Item
                key={preset.id}
                title={preset.title}
                subtitle={preset.subtitle}
                icon={Icon.MagnifyingGlass}
                actions={
                  <ActionPanel>
                    <Action
                      title="Run Search"
                      onAction={() => setSearchText(preset.query)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Query"
                      content={preset.query}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>

          {response?.suggestions?.length ? (
            <List.Section title="Follow-up Prompts">
              {response.suggestions.map((suggestion, index) => (
                <List.Item
                  key={`${index}-${suggestion}`}
                  title={suggestion}
                  icon={Icon.Repeat}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Run Follow-up Search"
                        onAction={() => setSearchText(suggestion)}
                      />
                      <Action.CopyToClipboard
                        title="Copy Follow-up"
                        content={suggestion}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          ) : null}
        </>
      )}

      {errorMessage ? (
        <List.Section title="Connection">
          <List.Item
            title="Unable to load TownSpot events"
            subtitle={errorMessage}
            icon={Icon.ExclamationMark}
          />
        </List.Section>
      ) : null}

      {zonesError ? (
        <List.Section title="Home Zone">
          <List.Item
            title="Active towns unavailable"
            subtitle={zonesError}
            icon={Icon.ExclamationMark}
          />
        </List.Section>
      ) : null}
    </List>
  );
}
