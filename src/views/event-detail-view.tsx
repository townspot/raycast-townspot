import { Action, ActionPanel, Detail } from "@raycast/api";
import { formatEventTime } from "../lib/event-listing";
import { RaycastEvent } from "../types";

type EventDetailViewProps = {
  event: RaycastEvent;
  timezone: string;
  url: string;
};

const buildMarkdown = (
  event: RaycastEvent,
  timezone: string,
  url: string,
): string => {
  const timeLabel = formatEventTime(event.startTime, timezone);
  const categories = event.tags.length
    ? event.tags.join(", ")
    : "None listed";

  return [
    `# ${event.title}`,
    "",
    `**Time**: ${timeLabel || event.startLabel || "TBC"}`,
    `**Venue**: ${event.venueName || "TBC"}`,
    `**Categories**: ${categories}`,
    "",
    `[Open on TownSpot](${url})`,
  ].join("\n");
};

export const EventDetailView = ({
  event,
  timezone,
  url,
}: EventDetailViewProps): JSX.Element => {
  return (
    <Detail
      markdown={buildMarkdown(event, timezone, url)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open on Website" url={url} />
          <Action.CopyToClipboard title="Copy Event Link" content={url} />
          <Action.CopyToClipboard title="Copy Event Name" content={event.title} />
        </ActionPanel>
      }
    />
  );
};

