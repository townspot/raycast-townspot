import { normalizeApiBaseUrl, sanitizeTownSlug } from "./townspot";

export type ActiveZoneOption = {
  id: number;
  name: string;
  slug: string;
  countryCode?: string;
};

type RawZone = {
  id?: number;
  name?: string;
  slug?: string;
  country_code?: string;
  active?: boolean;
  hidden?: boolean;
};

const localeToCountry = (locale: string): string | undefined => {
  const normalized = String(locale || "").toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith("en")) return "uk";
  if (normalized.startsWith("es") || normalized.startsWith("ca")) return "es";
  return undefined;
};

const toActiveZoneOption = (zone: RawZone): ActiveZoneOption | null => {
  const id = Number(zone.id);
  const slug = sanitizeTownSlug(zone.slug || "");
  const name = String(zone.name || "").trim();

  if (!Number.isFinite(id) || !slug || !name) return null;
  if (zone.hidden === true) return null;
  if (zone.active === false) return null;

  return {
    id,
    name,
    slug,
    countryCode: zone.country_code || undefined,
  };
};

const uniqueBySlug = (zones: ActiveZoneOption[]): ActiveZoneOption[] => {
  const seen = new Set<string>();
  const result: ActiveZoneOption[] = [];

  for (const zone of zones) {
    if (seen.has(zone.slug)) continue;
    seen.add(zone.slug);
    result.push(zone);
  }

  return result;
};

export const fetchActiveZones = async (
  apiBaseUrl: string,
  locale: string,
): Promise<ActiveZoneOption[]> => {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl).replace(/\/$/, "");
  const country = localeToCountry(locale);
  const endpoint = country
    ? `${normalizedBaseUrl}/list?country=${encodeURIComponent(country)}`
    : `${normalizedBaseUrl}/list`;

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not load active towns (${response.status})`);
  }

  const payload = (await response.json()) as RawZone[];
  const rawZones = Array.isArray(payload) ? payload : [];

  const options = rawZones
    .map(toActiveZoneOption)
    .filter((item): item is ActiveZoneOption => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));

  return uniqueBySlug(options);
};

