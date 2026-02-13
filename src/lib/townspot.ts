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

const sanitizeApiBaseUrl = (apiBaseUrl: string): string => {
  const value = String(apiBaseUrl || "").trim();
  if (!value) {
    throw new Error("TownSpot API Base URL is required.");
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return `http://${value}`;
  }
  return value;
};

export const askTownspot = async (payload: AskPayload): Promise<RaycastResponse> => {
  const query = sanitizeQuery(payload.query);
  const townSlug = sanitizeTown(payload.townSlug);
  const locale = sanitizeLocale(payload.locale);
  const apiBaseUrl = sanitizeApiBaseUrl(payload.apiBaseUrl);
  const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/raycast/query`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
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
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown network error";
    throw new Error(
      `Could not reach TownSpot at ${endpoint}. Ensure the server is running and reachable. ` +
        `Use http://localhost:3000/api for local dev. (${details})`,
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`TownSpot query failed (${response.status}): ${details || response.statusText}`);
  }

  const body = (await response.json()) as RaycastResponse;
  return body;
};
