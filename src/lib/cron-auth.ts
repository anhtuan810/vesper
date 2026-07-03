import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/safe-compare";

// Shared authorization for the Vercel cron routes (and any manual trigger).
// Returns a short-circuit NextResponse on failure, or null when authorized.
//
// Fails CLOSED: if CRON_SECRET is unset in the environment, EVERY request is
// rejected. The previous inline check (`auth !== \`Bearer ${process.env.CRON_SECRET}\``)
// would, with the secret unset, compare against the literal string
// "Bearer undefined" — which any caller could send, turning the crons (all-user
// snapshot recompute, LLM-backed market highlights, demo reaping) into an open,
// unauthenticated endpoint. Comparison is constant-time (see safeEqual).
export function assertCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  const provided = req.headers.get("authorization") ?? "";
  if (!safeEqual(provided, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
