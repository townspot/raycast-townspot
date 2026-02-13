import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  appleMapsUrl,
  EventDetails,
  fetchEventDetails,
  googleMapsUrl,
} from "../lib/event-details";
import { formatEventTime } from "../lib/event-listing";
import { RaycastEvent } from "../types";

type EventDetailViewProps = {
  event: RaycastEvent;
  timezone: string;
  url: string;
  apiBaseUrl: string;
};

const formatDateTime = (value: string | undefined | null, timezone: string): string => {
  if (!value) return "TBC";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBC";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Europe/London",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
};

const escapeMarkdown = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\\]()#+\-.!])/g, "\\$1");

const buildMarkdown = (
  title: string,
  description: string | null,
  imageUrl: string | null,
): string => {
  const blocks = [`# ${escapeMarkdown(title)}`];
  if (imageUrl) {
    blocks.push("", `![Event image](${imageUrl})`);
  }
  if (description) {
    blocks.push("", description);
  }
  return blocks.join("\n");
};

const categoriesLabel = (details: EventDetails | null, event: RaycastEvent): string => {
  const categories = details?.categories?.length ? details.categories : event.tags;
  return categories && categories.length ? categories.join(", ") : "None listed";
};

const fallbackVenue = (details: EventDetails | null, event: RaycastEvent): string => {
  return (
    details?.locationName ||
    details?.venueDescription ||
    event.venueName ||
    "TBC"
  );
};

const fallbackAddress = (details: EventDetails | null): string => {
  return details?.locationAddress || details?.venueDescription || "Not provided";
};

const EventMetadata = ({
  details,
  timezone,
  event,
  url,
}: {
  details: EventDetails | null;
  timezone: string;
  event: RaycastEvent;
  url: string;
}): JSX.Element => {
  const effectiveTimezone = details?.resolvedTimezone || details?.timezone || timezone;
  const startValue = details?.startTimeLocal || details?.startTime || event.startTime;
  const endValue = details?.endTimeLocal || details?.endTime || event.endTime;
  const isFreeText =
    details?.isFree === true ? "Yes" : details?.isFree === false ? "No" : "Unknown";

  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Time" text={formatDateTime(startValue, effectiveTimezone)} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="Ends"
        text={endValue ? formatDateTime(endValue, effectiveTimezone) : "Not specified"}
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Venue" text={fallbackVenue(details, event)} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Address" text={fallbackAddress(details)} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.TagList title="Categories">
        {categoriesLabel(details, event)
          .split(", ")
          .filter(Boolean)
          .map((category) => (
          <Detail.Metadata.TagList.Item key={category} text={category} />
        ))}
      </Detail.Metadata.TagList>
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="Price"
        text={details?.priceInfo || (details?.isFree === true ? "Free" : "Not specified")}
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="Booking Required"
        text={
          details?.bookingRequired === true
            ? "Yes"
            : details?.bookingRequired === false
              ? "No"
              : "Unknown"
        }
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Free Event" text={isFreeText} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Town" text={details?.zoneName || "Unknown"} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Link title="TownSpot Link" target={url} text="Open listing" />
      {details?.sourceUrl ? (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Link title="Source Link" target={details.sourceUrl} text="Open source" />
        </>
      ) : null}
    </Detail.Metadata>
  );
};

export const EventDetailView = ({
  event,
  timezone,
  url,
  apiBaseUrl,
}: EventDetailViewProps): JSX.Element => {
  const [details, setDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchEventDetails(apiBaseUrl, event.id);
        if (cancelled) return;
        setDetails(payload);
      } catch (loadError) {
        if (cancelled) return;
        setDetails(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load event details");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, event.id]);

  const effectiveTimezone = details?.resolvedTimezone || details?.timezone || timezone;
  const detailMarkdown = useMemo(() => {
    const description = details?.description || null;
    const imageUrl = details?.imageUrl || details?.mainImgUrl || null;
    return buildMarkdown(details?.title || event.title, description, imageUrl);
  }, [details, event.title]);

  const mapsLabel = details?.locationName || details?.locationAddress || event.venueName;
  const hasCoordinates =
    typeof details?.lat === "number" &&
    Number.isFinite(details.lat) &&
    typeof details?.lng === "number" &&
    Number.isFinite(details.lng);

  const legacyTimeLabel = formatEventTime(event.startTime, effectiveTimezone);

  return (
    <Detail
      isLoading={loading}
      markdown={
        error
          ? `${detailMarkdown}\n\n---\n\n⚠️ Could not load full details (${error}).`
          : detailMarkdown
      }
      metadata={
        <EventMetadata details={details} timezone={effectiveTimezone} event={event} url={url} />
      }
      actions={
        <ActionPanel>
          {hasCoordinates ? (
            <>
              <Action.OpenInBrowser
                title="Open in Apple Maps"
                url={appleMapsUrl(details.lat as number, details.lng as number, mapsLabel)}
              />
              <Action.OpenInBrowser
                title="Open in Google Maps"
                url={googleMapsUrl(details.lat as number, details.lng as number, mapsLabel)}
              />
            </>
          ) : null}
          <Action.OpenInBrowser title="Open on Website" url={url} />
          <Action.CopyToClipboard title="Copy Event Link" content={url} />
          <Action.CopyToClipboard title="Copy Event Name" content={event.title} />
          <Action.CopyToClipboard
            title="Copy Event Time"
            content={legacyTimeLabel || event.startLabel || "TBC"}
          />
          {details?.locationAddress ? (
            <Action.CopyToClipboard
              title="Copy Event Address"
              content={details.locationAddress}
            />
          ) : null}
        </ActionPanel>
      }
    />
  );
};
