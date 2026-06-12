import { createSign, createPrivateKey } from "node:crypto";
import { connect } from "node:http2";

// Minimal APNs HTTP/2 sender (token-based auth, ES256 JWT). No SDK dependency:
// Node's http2 + crypto cover the whole protocol. Configured via env:
//   APNS_TEAM_ID      — Apple Developer team id
//   APNS_KEY_ID       — id of the APNs auth key
//   APNS_PRIVATE_KEY  — the .p8 contents (PEM; \n-escaped newlines accepted)
//   APNS_ENV          — "production" (default) | "sandbox"
// Silently inert when unconfigured, so web-only deploys never break.

const TOPIC = "nl.volnar.app"; // apns-topic = bundle id

let cachedJwt: { token: string; issuedAt: number } | null = null;

function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY
  );
}

// APNs accepts a provider JWT for up to an hour; refresh after 45 minutes.
function providerJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 45 * 60) return cachedJwt.token;

  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now })
  ).toString("base64url");

  const key = createPrivateKey(process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const signature = createSign("SHA256")
    .update(`${header}.${claims}`)
    .sign({ key, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  const token = `${header}.${claims}.${signature}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

export interface PushMessage {
  title: string;
  body: string;
  // Same-app path opened on tap (see installPushTapHandler), e.g. "/diary".
  link?: string;
}

// Sends one alert to one device token. Resolves "ok" on 200, "gone" when APNs
// reports the token dead (410 / BadDeviceToken — caller should delete the row),
// "error" otherwise. Never throws.
export async function sendPush(
  deviceToken: string,
  message: PushMessage
): Promise<"ok" | "gone" | "error"> {
  if (!apnsConfigured()) return "error";

  const host =
    process.env.APNS_ENV === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  const payload = JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    ...(message.link ? { link: message.link } : {}),
  });

  return new Promise((resolve) => {
    const client = connect(host);
    client.on("error", () => resolve("error"));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerJwt()}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => (responseBody += chunk));
    req.on("end", () => {
      client.close();
      if (status === 200) return resolve("ok");
      if (status === 410 || responseBody.includes("BadDeviceToken")) return resolve("gone");
      console.error(`apns: send failed status=${status} body=${responseBody}`);
      resolve("error");
    });
    req.on("error", () => {
      client.close();
      resolve("error");
    });

    req.end(payload);
  });
}

// Fans a message out to every registered device of a user, pruning dead tokens.
// Returns the number of successful sends.
export async function pushToUser(
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  message: PushMessage
): Promise<number> {
  if (!apnsConfigured()) return 0;

  const { data: rows } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId);
  if (!rows?.length) return 0;

  let sent = 0;
  for (const { token } of rows as Array<{ token: string }>) {
    const result = await sendPush(token, message);
    if (result === "ok") sent++;
    if (result === "gone") {
      await supabase.from("device_tokens").delete().eq("user_id", userId).eq("token", token);
    }
  }
  return sent;
}
