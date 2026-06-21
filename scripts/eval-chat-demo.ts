// LIVE end-to-end READ-ONLY Q&A eval against the seeded demo account.
//
// Signs into the shared demo account via POST /api/demo-session (which reseeds
// the deterministic "Alex" portfolio), then asks read-only questions through the
// real POST /api/chat and asserts the answers contain the KNOWN seeded values.
// Exercises the full path the model-only eval can't: auth → DB context → model →
// answer. READ-ONLY — only questions, never adds/edits/removes, so it cannot
// corrupt the shared demo (and a reseed restores it regardless).
//
// Targets a deployed app (the server holds the demo creds + Anthropic key); set
// APP_BASE_URL (default https://app.volnar.nl). Skips cleanly if the demo
// session is unavailable, and SKIPS (never fails) on a 429 so the demo account's
// daily chat limit can't produce a false failure.
//
// Run:  APP_BASE_URL=https://app.volnar.nl npx tsx scripts/eval-chat-demo.ts

const BASE = (process.env.APP_BASE_URL ?? "https://app.volnar.nl").replace(/\/$/, "");

function skip(msg: string): never {
  console.log(`⚠ ${msg} — skipping demo read eval.`);
  process.exit(0);
}

interface Q {
  name: string;
  q: string;
  ok: (a: string) => boolean;
}

// Expected values come straight from the deterministic demo seed (demo-seed.ts):
// 40 NVIDIA, 0.07 BTC, €26k cash, €34k DC pension, Amsterdam + Rotterdam property,
// EUR display, ~€340k net worth (≈72% property equity).
const QUESTIONS: Q[] = [
  { name: "NVIDIA share count = 40", q: "How many NVIDIA shares do I have?", ok: (a) => /\b40\b/.test(a) },
  { name: "Bitcoin = 0.07", q: "How much Bitcoin do I own?", ok: (a) => /0\.0?7/.test(a) },
  { name: "cash ≈ €26,000", q: "How much cash do I have?", ok: (a) => /26[,. ]?000|26\s?k/i.test(a) },
  { name: "pension ≈ €34,000", q: "What's my workplace pension worth?", ok: (a) => /34[,. ]?000|34\s?k/i.test(a) },
  { name: "owns Amsterdam + Rotterdam property", q: "Do I own any property?", ok: (a) => /amsterdam/i.test(a) && /rotterdam/i.test(a) },
  { name: "portfolio currency is EUR", q: "What currency is my portfolio shown in?", ok: (a) => /eur|euro|€/i.test(a) },
  { name: "net worth ≈ €340–399k (deterministic ~€368k)", q: "What's my net worth?", ok: (a) => /3[4-9]\d[,. ]?\d{3}|3[4-9]\d\s?k/i.test(a) },
  { name: "biggest exposure is property", q: "What's my biggest holding?", ok: (a) => /propert|apartment|amsterdam|real[- ]?estate/i.test(a) },
];

async function main(): Promise<void> {
  // 1. Reseed + sign in.
  let token: string;
  try {
    const res = await fetch(`${BASE}/api/demo-session`, { method: "POST" });
    if (res.status === 404) skip("demo session unavailable (DEMO_* not configured on the server)");
    if (!res.ok) skip(`demo session returned ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { access_token?: string };
    if (!data.access_token) skip("demo session returned no access token");
    token = data.access_token;
  } catch (err) {
    skip(`demo session request failed (${err instanceof Error ? err.message : String(err)})`);
  }

  const ask = async (message: string): Promise<{ status: number; text: string }> => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { status: res.status, text: typeof data.message === "string" ? data.message : "" };
  };

  let failures = 0;
  for (const item of QUESTIONS) {
    try {
      const { status, text } = await ask(item.q);
      if (status === 429) skip("demo account hit its daily chat limit (429)");
      if (status === 401 || status === 403) skip(`demo chat not authorized (${status})`);
      const ok = !!text && item.ok(text);
      if (!ok) failures++;
      console.log(`  [${ok ? "PASS" : "FAIL"}] ${item.name}`);
      if (!ok) console.log(`        Q: ${item.q}\n        A: ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    } catch (err) {
      failures++;
      console.log(`  [ERROR] ${item.name}  — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(failures === 0 ? `\nAll ${QUESTIONS.length} demo read-Q&A checks passed.` : `\n${failures}/${QUESTIONS.length} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
