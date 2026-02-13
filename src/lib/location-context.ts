import { normalizeApiBaseUrl, sanitizeTownSlug } from "./townspot";

const FALLBACK_TOWN_SLUG = "kentish-town";

export type TownContext = {
  slug: string;
  name: string;
  source: "argument" | "preference" | "detected" | "fallback";
};

type ResolveTownContextInput = {
  argumentTownSlug?: string;
  defaultTownSlug?: string;
  apiBaseUrl: string;
};

type IpLocation = {
  lat: number;
  lng: number;
};

type ZoneMatchResponse = {
  zone?: {
    slug?: string;
    name?: string;
  } | null;
};

type IpApiResponse = {
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lon?: number | string;
};

const toTownName = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const withTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const fetchIpLocation = async (): Promise<IpLocation | null> => {
  try {
    const response = await withTimeout("https://ipapi.co/json/", 1600);
    if (!response.ok) return null;

    const payload = (await response.json()) as IpApiResponse;
    const lat = toNumber(payload.latitude ?? payload.lat);
    const lng = toNumber(payload.longitude ?? payload.lon);

    if (lat === null || lng === null) return null;
    return { lat, lng };
  } catch {
    return null;
  }
};

const fetchZoneFromCoordinates = async (
  apiBaseUrl: string,
  lat: number,
  lng: number,
): Promise<{ slug: string; name: string } | null> => {
  try {
    const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl).replace(/\/$/, "");
    const endpoint = `${normalizedBaseUrl}/places/match-zone?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
    const response = await withTimeout(endpoint, 1600);
    if (!response.ok) return null;

    const payload = (await response.json()) as ZoneMatchResponse;
    const slug = sanitizeTownSlug(payload?.zone?.slug || "");
    if (!slug) return null;

    const name = String(payload?.zone?.name || "").trim() || toTownName(slug);
    return { slug, name };
  } catch {
    return null;
  }
};

export const resolveTownContext = async (
  input: ResolveTownContextInput,
): Promise<TownContext> => {
  const fromArgument = sanitizeTownSlug(input.argumentTownSlug || "");
  if (fromArgument) {
    return {
      slug: fromArgument,
      name: toTownName(fromArgument),
      source: "argument",
    };
  }

  const fromPreference = sanitizeTownSlug(input.defaultTownSlug || "");
  if (fromPreference) {
    return {
      slug: fromPreference,
      name: toTownName(fromPreference),
      source: "preference",
    };
  }

  const ipLocation = await fetchIpLocation();
  if (ipLocation) {
    const matchedZone = await fetchZoneFromCoordinates(
      input.apiBaseUrl,
      ipLocation.lat,
      ipLocation.lng,
    );
    if (matchedZone) {
      return {
        slug: matchedZone.slug,
        name: matchedZone.name,
        source: "detected",
      };
    }
  }

  return {
    slug: FALLBACK_TOWN_SLUG,
    name: toTownName(FALLBACK_TOWN_SLUG),
    source: "fallback",
  };
};

