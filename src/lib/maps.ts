export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

export function streetViewUrlFromAddress(address: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
}

export function streetViewUrlForAsset(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
): string | null {
  if (lat != null && lng != null) return streetViewUrl(lat, lng);
  if (address) return streetViewUrlFromAddress(address);
  return null;
}
