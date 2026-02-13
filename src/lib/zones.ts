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
  countryCode?: string;
  active?: boolean;
  hidden?: boolean;
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
    countryCode: zone.country_code || zone.countryCode || undefined,
  };
};

const fetchFromEndpoint = async (endpoint: string): Promise<Response> =>
  fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

export const fetchActiveZones = async (
  apiBaseUrl: string,
): Promise<ActiveZoneOption[]> => {
  const normalizedBaseUrl = normalizeApiBaseUrl(apiBaseUrl).replace(/\/$/, "");
  const endpoints = [
    `${normalizedBaseUrl}/locations/list?includeHidden=true`,
    `${normalizedBaseUrl}/locations/list`,
    `${normalizedBaseUrl}/list`,
  ];

  let response: Response | null = null;
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    try {
      const current = await fetchFromEndpoint(endpoint);
      if (current.ok) {
        response = current;
        break;
      }
      lastStatus = current.status;
    } catch {
      lastStatus = 0;
    }
  }

  if (!response) {
    throw new Error(`Could not load active towns (${lastStatus || "network"})`);
  }

  const payload = (await response.json()) as RawZone[];
  const rawZones = Array.isArray(payload) ? payload : [];

  const options = rawZones
    .map(toActiveZoneOption)
    .filter((item): item is ActiveZoneOption => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));

  return options;
};
