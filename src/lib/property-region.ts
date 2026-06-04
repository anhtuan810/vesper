// Resolve a property's stored address to its Dutch gemeente + province via the
// PDOK Locatieserver (free, no key). Server-side only; the address is disclosed
// only to PDOK. Never throws — any failure returns null.

const PDOK_FREE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const FETCH_TIMEOUT_MS = 8000;

export interface PropertyRegion {
  gemeente: string | null;
  province: string | null;
}

export async function resolveRegion(address: string | null | undefined): Promise<PropertyRegion | null> {
  const q = (address || "").trim();
  if (!q) return null;
  try {
    const url = `${PDOK_FREE_URL}?q=${encodeURIComponent(q)}&fq=type:adres&rows=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data?.response?.docs?.[0];
    if (!doc) return null;
    const gemeente = typeof doc.gemeentenaam === "string" && doc.gemeentenaam ? doc.gemeentenaam : null;
    const province = typeof doc.provincienaam === "string" && doc.provincienaam ? doc.provincienaam : null;
    if (!gemeente && !province) return null;
    return { gemeente, province };
  } catch {
    return null;
  }
}
