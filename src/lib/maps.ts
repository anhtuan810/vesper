export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m1!1e3`;
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
