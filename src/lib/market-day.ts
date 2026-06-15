// Epoch (seconds) of the start of today's US-Eastern trading day. The liquid
// portfolio 1D and the single-asset 1D charts both anchor to this market day so
// every user (US or EU) shares one clock and the two charts cover the same span.
export function easternMidnightUnix(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const secsSinceMidnight = (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
  return Math.floor(now.getTime() / 1000) - secsSinceMidnight;
}
