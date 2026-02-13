import { RaycastResponse, AskPayload } from "../types";

const sanitizeQuery = (query: string): string => {
  const trimmed = String(query || "").trim().replace(/\s+/g, " ");
  return trimmed.length ? trimmed : "what's on";
};

const sanitizeTown = (townSlug: string): string =>
  String(townSlug || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");

const sanitizeLocale = (locale: string): string => {
  const value = String(locale || "en-GB").trim();
  if (!value) return "en-GB";
  return value;
};

export const askTownspot = async (payload: AskPayload): Promise<RaycastResponse> => {
  const query = sanitizeQuery(payload.query);
  const townSlug = sanitizeTown(payload.townSlug);
  const locale = sanitizeLocale(payload.locale);
  const response = await fetch(`${payload.apiBaseUrl.replace(/\/$/, "")}/raycast/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      townSlug,
      locale,
      limit: payload.limit || 8,
      conversation: payload.conversation || [],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`TownSpot query failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as RaycastResponse;
  return body;
};
