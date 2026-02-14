import { Action, ActionPanel, Detail } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import {
  appleMapsUrl,
  EventDetails,
  fetchEventDetails,
  googleMapsUrl,
  staticMapPreviewUrl,
} from "../lib/event-details";
import { formatEventTime } from "../lib/event-listing";
import { splitEventTags } from "../lib/event-tags";
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

const formatTimeRange = (
  startValue: string | undefined | null,
  endValue: string | undefined | null,
  timezone: string,
): string => {
  const start = formatDateTime(startValue, timezone);
  if (!endValue) return start;
  const end = formatDateTime(endValue, timezone);
  if (start === "TBC") return end;
  return `${start} -> ${end}`;
};

const escapeMarkdown = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/([*_`[\\]()#+\-.!])/g, "\\$1");

const fallbackVenue = (details: EventDetails | null, event: RaycastEvent): string => {
  return details?.locationName || details?.venueDescription || event.venueName || "TBC";
};

const fallbackAddress = (details: EventDetails | null): string => {
  return details?.locationAddress || details?.venueDescription || "";
};

const recurringLabel = (event: RaycastEvent): string | null => {
  const frequency = splitEventTags(event.tags).frequency;
  if (!frequency) return null;
  if (frequency.toLowerCase() === "one-off") return null;
  return `${frequency} recurring event`;
};

const priceLabel = (details: EventDetails | null): string | null => {
  const explicit = String(details?.priceInfo || "").trim();
  if (explicit) return explicit;
  if (details?.isFree === true) return "Free";
  if (details?.isFree === false) return "Paid";
  return null;
};

const categoryList = (details: EventDetails | null, event: RaycastEvent): string[] => {
  const fallbackCategories = splitEventTags(event.tags).categories;
  const values = details?.categories?.length ? details.categories : fallbackCategories;
  return (values || []).filter(Boolean);
};

const categoriesLabel = (details: EventDetails | null, event: RaycastEvent): string => {
  const categories = categoryList(details, event);
  return categories.length ? categories.join(", ") : "None listed";
};

const buildMarkdown = (
  title: string,
  description: string | null,
  imageUrl: string | null,
  metaRows: string[],
  mapImageUrl: string | null,
  mapLinksMarkdown: string | null,
): string => {
  const blocks = [`# ${escapeMarkdown(title)}`];

  if (imageUrl) {
    blocks.push("", `![Event image](${imageUrl})`);
  }

  if (metaRows.length) {
    blocks.push("", ...metaRows.map((row) => escapeMarkdown(row)));
  }

  if (mapImageUrl) {
    blocks.push("", `![Map preview](${mapImageUrl})`);
  }

  if (mapLinksMarkdown) {
    blocks.push("", mapLinksMarkdown);
  }

  if (description) {
    blocks.push("", description);
  }

  return blocks.join("\n");
};

const buildShareMessage = (
  title: string,
  timeRangeLabel: string,
  venueLabel: string,
  url: string,
): string => {
  return `${title}\n${timeRangeLabel}\n📍 ${venueLabel}\n${url}`;
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
  const timeRangeLabel = formatTimeRange(startValue, endValue, effectiveTimezone);
  const venueLabel = fallbackVenue(details, event);
  const addressLabel = fallbackAddress(details);
  const recurring = recurringLabel(event);
  const price = priceLabel(details);
  const categories = categoryList(details, event);

  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="When" text={timeRangeLabel} />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label title="Where" text={venueLabel} />
      <Detail.Metadata.Separator />
      {addressLabel ? (
        <>
          <Detail.Metadata.Label title="Address" text={addressLabel} />
          <Detail.Metadata.Separator />
        </>
      ) : null}
      {recurring ? (
        <>
          <Detail.Metadata.Label title="Recurrence" text={recurring} />
          <Detail.Metadata.Separator />
        </>
      ) : null}
      {price ? (
        <>
          <Detail.Metadata.Label title="Price" text={price} />
          <Detail.Metadata.Separator />
        </>
      ) : null}
      {categories.length ? (
        <>
          <Detail.Metadata.TagList title="Categories">
            {categories.map((category) => (
              <Detail.Metadata.TagList.Item key={category} text={category} />
            ))}
          </Detail.Metadata.TagList>
          <Detail.Metadata.Separator />
        </>
      ) : null}
      {details?.zoneName ? (
        <>
          <Detail.Metadata.Label title="Town" text={details.zoneName} />
          <Detail.Metadata.Separator />
        </>
      ) : null}
      <Detail.Metadata.Link title="TownSpot Link" target={url} text="Open listing" />
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
  const startValue = details?.startTimeLocal || details?.startTime || event.startTime;
  const endValue = details?.endTimeLocal || details?.endTime || event.endTime;
  const venueLabel = fallbackVenue(details, event);
  const addressLabel = fallbackAddress(details);
  const recurring = recurringLabel(event);
  const price = priceLabel(details);
  const categoryLabel = categoriesLabel(details, event);
  const timeRangeLabel = formatTimeRange(startValue, endValue, effectiveTimezone);

  const mapsLabel = details?.locationName || details?.locationAddress || event.venueName;
  const hasCoordinates =
    typeof details?.lat === "number" &&
    Number.isFinite(details.lat) &&
    typeof details?.lng === "number" &&
    Number.isFinite(details.lng);

  const googleUrl = hasCoordinates
    ? googleMapsUrl(details.lat as number, details.lng as number, mapsLabel)
    : null;
  const appleUrl = hasCoordinates
    ? appleMapsUrl(details.lat as number, details.lng as number, mapsLabel)
    : null;
  const mapImageUrl = hasCoordinates
    ? staticMapPreviewUrl(details.lat as number, details.lng as number)
    : null;

  const mapLinksMarkdown =
    googleUrl && appleUrl
      ? `[Open in Apple Maps](${appleUrl}) | [Open in Google Maps](${googleUrl})`
      : null;

  const detailMarkdown = useMemo(() => {
    const description = details?.description || null;
    const imageUrl = details?.imageUrl || details?.mainImgUrl || null;
    const metaRows = [
      `🕒 ${timeRangeLabel}`,
      `📍 ${venueLabel}`,
      addressLabel ? `🧭 ${addressLabel}` : "",
      recurring ? `🔁 ${recurring}` : "",
      categoryLabel && categoryLabel !== "None listed" ? `🏷️ ${categoryLabel}` : "",
      price ? `💸 ${price}` : "",
    ].filter(Boolean);

    return buildMarkdown(
      details?.title || event.title,
      description,
      imageUrl,
      metaRows,
      mapImageUrl,
      mapLinksMarkdown,
    );
  }, [
    details,
    event.title,
    timeRangeLabel,
    venueLabel,
    addressLabel,
    recurring,
    categoryLabel,
    price,
    mapImageUrl,
    mapLinksMarkdown,
  ]);

  const legacyTimeLabel = formatEventTime(event.startTime, effectiveTimezone);
  const shareMessage = buildShareMessage(
    details?.title || event.title,
    timeRangeLabel,
    venueLabel,
    url,
  );
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

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
              <Action.OpenInBrowser title="Open in Apple Maps" url={appleUrl as string} />
              <Action.OpenInBrowser title="Open in Google Maps" url={googleUrl as string} />
            </>
          ) : null}
          <Action.OpenInBrowser title="Share on WhatsApp" url={whatsappUrl} />
          <Action.CopyToClipboard title="Copy Share Message" content={shareMessage} />
          <Action.OpenInBrowser title="Open on Website" url={url} />
          <Action.CopyToClipboard title="Copy Event Link" content={url} />
          <Action.CopyToClipboard title="Copy Event Name" content={event.title} />
          <Action.CopyToClipboard
            title="Copy Event Time"
            content={legacyTimeLabel || event.startLabel || "TBC"}
          />
          {details?.locationAddress ? (
            <Action.CopyToClipboard title="Copy Event Address" content={details.locationAddress} />
          ) : null}
          {details?.sourceUrl ? (
            <Action.OpenInBrowser title="Open Source Link" url={details.sourceUrl} />
          ) : null}
        </ActionPanel>
      }
    />
  );
};
