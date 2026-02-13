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

export default function Command(
  props: LaunchProps<{ arguments: AskArguments }>,
): JSX.Element {
  const preferences = getPreferenceValues<Preferences>();
  const initialTownSlug = sanitizeTownSlug(props.arguments.townSlug || "");
  const initialQuery = sanitizeQuery(props.arguments.query);

  const [townContext, setTownContext] = useState<TownContext | null>(null);
  const [searchText, setSearchText] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [resolvingTown, setResolvingTown] = useState(true);
  const [response, setResponse] = useState<RaycastResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const debouncedSearchText = useDebouncedValue(searchText, 350);

  useEffect(() => {
    let cancelled = false;

    const resolveTown = async () => {
      setResolvingTown(true);
      const resolved = await resolveTownContext({
        argumentTownSlug: initialTownSlug,
        defaultTownSlug: preferences.defaultTownSlug,
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
  }, [initialTownSlug, preferences.apiBaseUrl, preferences.defaultTownSlug]);

  useEffect(() => {
    if (!townContext?.slug) return;

    let cancelled = false;
    const runQuery = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const result = await askTownspot({
          query: debouncedSearchText,
          townSlug: townContext.slug,
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
    townContext?.slug,
  ]);

  const activeTownName = response?.town?.name || townContext?.name || "Town";
  const activeTownSlug = response?.town?.slug || townContext?.slug || "";
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

  const contextSubtitle = townContext
    ? `${activeTownSlug} · ${formatSourceLabel(townContext.source)}`
    : "Resolving your location context";

  return (
    <List
      isLoading={loading || resolvingTown}
      searchBarPlaceholder="Ask naturally: tonight, weekend, kids events, free events..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      throttle
    >
      <List.Section title="Context">
        <List.Item
          title={`Town: ${activeTownName}`}
          subtitle={contextSubtitle}
          icon={{ source: "icon.png" }}
          accessories={activeTimezone ? [{ text: activeTimezone }] : []}
          actions={
            <ActionPanel>
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

      <List.Section title="Verified Events">
        {response?.events?.length ? (
          response.events.map((event) => (
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
                    url={event.url}
                  />
                  <Action.CopyToClipboard
                    title="Copy Event Link"
                    content={event.url}
                  />
                  <Action.CopyToClipboard
                    title="Copy Event Name"
                    content={event.title}
                  />
                </ActionPanel>
              }
            />
          ))
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
    </List>
  );
}
