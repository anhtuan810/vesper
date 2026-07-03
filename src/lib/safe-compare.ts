import { createHash, timingSafeEqual } from "crypto";

// Constant-time, length-independent string equality. Hash both sides to a fixed
// 32-byte digest first, so neither the comparison time nor an early length check
// leaks anything about the secret. Use for verifying shared secrets carried in
// request headers (cron bearer token, webhook auth header) — a plain `!==`
// short-circuits on the first differing byte, a timing side-channel on the token.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
