import {
  Action,
  ActionPanel,
  Icon,
  LaunchProps,
  List,
  getPreferenceValues,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { buildGroundedSummary } from "./lib/grounded-summary";
import { resolveTownContext, TownContext } from "./lib/location-context";
import { QUICK_QUERY_PRESETS } from "./lib/query-presets";
import { askTownspot, sanitizeTownSlug } from "./lib/townspot";
import { ActiveZoneOption, fetchActiveZones } from "./lib/zones";
import { RaycastResponse } from "./types";

type AskArguments = {
  query?: string;
  townSlug?: string;
};

type Preferences = {
  apiBaseUrl: string;
  locale: string;
  defaultTownSlug?: string;
};

const DEFAULT_QUERY = "what's on tonight";
const AUTO_TOWN_VALUE = "__auto__";

const sanitizeQuery = (value: string | undefined): string => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : DEFAULT_QUERY;
};

const formatSourceLabel = (source: TownContext["source"]): string => {
  if (source === "detected") return "auto-detected from your location";
  if (source === "argument") return "from command argument";
  if (source === "preference") return "from command preference";
  return "fallback town";
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

export default function Command(
  props: LaunchProps<{ arguments: AskArguments }>,
): JSX.Element {
  const preferences = getPreferenceValues<Preferences>();
  const initialTownSlug = sanitizeTownSlug(props.arguments.townSlug || "");
  const initialQuery = sanitizeQuery(props.arguments.query);
  const initialSelectedTown =
    initialTownSlug ||
    sanitizeTownSlug(preferences.defaultTownSlug || "") ||
    AUTO_TOWN_VALUE;

  const [townContext, setTownContext] = useState<TownContext | null>(null);
  const [zones, setZones] = useState<ActiveZoneOption[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState("");
  const [selectedTownValue, setSelectedTownValue] = useState(initialSelectedTown);
  const [searchText, setSearchText] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [resolvingTown, setResolvingTown] = useState(true);
  const [response, setResponse] = useState<RaycastResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const debouncedSearchText = useDebouncedValue(searchText, 350);

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
    if (selectedTownValue === AUTO_TOWN_VALUE) return;
    if (!zones.length) return;
    if (zones.some((zone) => zone.slug === selectedTownValue)) return;
    setSelectedTownValue(AUTO_TOWN_VALUE);
  }, [selectedTownValue, zones]);

  useEffect(() => {
    if (selectedTownValue !== AUTO_TOWN_VALUE) {
      setTownContext(null);
      setResolvingTown(false);
      return;
    }

    let cancelled = false;

    const resolveTown = async () => {
      setResolvingTown(true);
      const resolved = await resolveTownContext({
        argumentTownSlug: "",
        defaultTownSlug: "",
        apiBaseUrl: preferences.apiBaseUrl,
      });

      if (cancelled) return;
      setTownContext(resolved);
      setResolvingTown(false);
    };

    void resolveTown();

    return () => {
      cancelled = true;
    };
  }, [preferences.apiBaseUrl, selectedTownValue]);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.slug === selectedTownValue),
    [selectedTownValue, zones],
  );

  const effectiveTownSlug =
    selectedTownValue === AUTO_TOWN_VALUE
      ? townContext?.slug || ""
      : selectedTownValue;

  useEffect(() => {
    if (!effectiveTownSlug) return;

    let cancelled = false;
    const runQuery = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const result = await askTownspot({
          query: debouncedSearchText,
          townSlug: effectiveTownSlug,
          locale: preferences.locale,
          apiBaseUrl: preferences.apiBaseUrl,
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
    debouncedSearchText,
    preferences.apiBaseUrl,
    preferences.locale,
    effectiveTownSlug,
  ]);

  const activeTownName =
    response?.town?.name ||
    selectedZone?.name ||
    townContext?.name ||
    "Town";
  const activeTownSlug = response?.town?.slug || effectiveTownSlug || "";
  const activeTimezone = response?.town?.timezone || "";
  const summary = useMemo(
    () =>
      buildGroundedSummary({
        townName: activeTownName,
        query: debouncedSearchText,
        events: response?.events || [],
      }),
    [activeTownName, debouncedSearchText, response],
  );

  const sourceLabel =
    selectedTownValue === AUTO_TOWN_VALUE
      ? townContext
        ? formatSourceLabel(townContext.source)
        : "resolving nearby town"
      : "selected from active towns";
  const contextSubtitle = `${activeTownSlug || "unknown"} · ${sourceLabel}`;

  return (
    <List
      isLoading={loading || resolvingTown || zonesLoading}
      searchBarPlaceholder="Ask naturally: tonight, weekend, kids events, free events..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Town"
          storeValue
          value={selectedTownValue}
          onChange={setSelectedTownValue}
        >
          <List.Dropdown.Item
            value={AUTO_TOWN_VALUE}
            title="Auto (Near Me)"
            icon={Icon.Pin}
          />
          <List.Dropdown.Section title="Active Towns">
            {zones.map((zone) => (
              <List.Dropdown.Item
                key={zone.slug}
                value={zone.slug}
                title={zone.name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
      throttle
    >
      <List.Section title="Verified Events">
        {response?.events?.length ? (
          response.events.map((event) => {
            const normalizedEventUrl = normalizeEventUrl(event.url);
            return (
              <List.Item
                key={event.id}
                title={event.title}
                subtitle={event.venueName || activeTownName}
                icon={{ source: "icon.png" }}
                accessories={[
                  ...(event.startLabel ? [{ tag: event.startLabel }] : []),
                  ...(event.tags[0] ? [{ text: event.tags[0] }] : []),
                ]}
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser
                      title="Open Event Page"
                      url={normalizedEventUrl}
                    />
                    <Action.CopyToClipboard
                      title="Copy Event Link"
                      content={normalizedEventUrl}
                    />
                    <Action.CopyToClipboard
                      title="Copy Event Name"
                      content={event.title}
                    />
                  </ActionPanel>
                }
              />
            );
          })
        ) : (
          <List.Item
            title="No verified events for this search"
            subtitle="Try broadening your query or switch to a quick search preset."
            icon={Icon.Calendar}
            actions={
              <ActionPanel>
                <Action
                  title="Search This Weekend"
                  onAction={() => setSearchText("what's on this weekend")}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      <List.Section title="Context">
        <List.Item
          title={`Town: ${activeTownName}`}
          subtitle={contextSubtitle}
          icon={{ source: "icon.png" }}
          accessories={[
            { text: `${zones.length} active` },
            ...(activeTimezone ? [{ text: activeTimezone }] : []),
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Use Auto (Near Me)"
                onAction={() => setSelectedTownValue(AUTO_TOWN_VALUE)}
                icon={Icon.Pin}
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
                title="Copy Verified Summary"
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
        <List.Section title="Town Selector">
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
