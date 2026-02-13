import {
  Action,
  ActionPanel,
  Detail,
  Form,
  getPreferenceValues,
  showToast,
  Toast,
} from "@raycast/api";
import { useState } from "react";
import { askTownspot } from "./lib/townspot";
import { RaycastResponse } from "./types";

type AskFormValues = {
  query: string;
  townSlug: string;
};

type Preferences = {
  apiBaseUrl: string;
  locale: string;
};

const buildMarkdown = (response: RaycastResponse): string => {
  const eventsSection = response.events
    .map((event) => {
      const when = event.startLabel || event.startTime;
      const timeLabel = when ? ` (${when})` : "";
      const location = event.venueName ? ` @ ${event.venueName}` : "";
      const tags = event.tags.length ? `\nTags: ${event.tags.join(", ")}` : "";
      return `- **${event.title}**${location}${timeLabel}\n  ${tags}\n  [Open event](${event.url})`;
    })
    .join("\n\n");

  const suggestions = response.suggestions
    .map((suggestion) => `- ${suggestion}`)
    .join("\n");

  return [
    `## ${response.answer}`,
    "",
    "### Town",
    `${response.town.name} (${response.town.slug}) • ${response.town.timezone}`,
    response.events.length ? "\n### Upcoming events" : "\n### Upcoming events",
    eventsSection || "No matches right now.",
    "",
    "### Suggestions",
    suggestions || "- Ask a follow-up in a new query.",
  ].join("\n");
};

export default function Command(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<RaycastResponse | null>(null);
  const preferences = getPreferenceValues<Preferences>();

  const handleSubmit = async (values: AskFormValues) => {
    setLoading(true);
    try {
      const result = await askTownspot({
        query: values.query,
        townSlug: values.townSlug,
        locale: preferences.locale,
        apiBaseUrl: preferences.apiBaseUrl,
        conversation: [],
      });

      setResponse(result);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "TownSpot query failed",
        message: error instanceof Error ? error.message : "Unable to reach TownSpot",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!response) {
    return (
      <Form
        isLoading={loading}
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Ask TownSpot" onSubmit={handleSubmit} />
          </ActionPanel>
        }
      >
        <Form.TextField
          id="query"
          title="Ask"
          placeholder="What\'s on in kentish-town tonight?"
          defaultValue="what's on in kentish-town tonight"
        />
        <Form.TextField
          id="townSlug"
          title="Town Slug"
          placeholder="kentish-town"
          defaultValue="kentish-town"
        />
      </Form>
    );
  }

  return (
    <Detail
      isLoading={loading}
      markdown={buildMarkdown(response)}
      actions={
        <ActionPanel>
          <Action
            title="Ask another question"
            onAction={() => {
              setResponse(null);
            }}
          />
          <Action.CopyToClipboard
            title="Copy Answer"
            content={response.answer}
          />
        </ActionPanel>
      }
    />
  );
}
