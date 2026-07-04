"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { track } from "@vercel/analytics";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { invalidateAssetsCache, invalidateInsightCache, invalidateVitalsCache } from "@/lib/hooks";
import { bumpPortfolioRevision } from "@/lib/portfolio-revision";
import {
  CHAT_TTL_MS, CHAT_LOAD_LIMIT, chatHistoryCacheKey, CHAT_HISTORY_PREFIX,
  CHAT_IMAGE_MAX_EDGE_PX, CHAT_IMAGE_JPEG_QUALITY, CHAT_IMAGE_MAX_INPUT_MB,
  CHAT_PDF_MAX_MB, CHAT_CSV_MAX_BYTES, CHAT_CSV_MAX_ROWS, CHAT_CSV_MAX_TEXT_LEN,
} from "@/lib/constants";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import type { ScenarioResult } from "@/lib/scenario/result";
import { apiFetch } from "@/lib/api";

export interface ChatMessage {
  id?: string;
  /** Stable client-side React key — assigned on create/load so a load-more
   * prepend doesn't shift array indices and re-mount/re-animate the thread. */
  localId?: string;
  from: "user" | "assistant";
  text: string;
  imagePreviews?: string[];
  suggestedReplies?: string[] | null;
  /** Ephemeral inline scenario card (not persisted; lost on history reload). */
  scenarioResult?: ScenarioResult | null;
}

// Monotonic counter backing the stable client-side message key (localId).
let localIdSeq = 0;
const nextLocalId = () => `m${++localIdSeq}`;

// Maps DB message rows into ChatMessages, splitting an assistant turn that was
// stored as multiple parts ("\n---\n"). Shared by the initial load, the pending-
// reply reconcile, and load-more so the three can't drift.
function mapDbMessages(
  rows: Array<{ id: string; role: "user" | "assistant"; content: string; suggested_replies?: string[] | null; tool_result?: ScenarioResult | null }>,
): ChatMessage[] {
  return rows.flatMap((m): ChatMessage[] => {
    if (m.role === "assistant" && m.content.includes("\n---\n")) {
      return m.content.split("\n---\n").map((part, i, arr) => ({
        id: i === 0 ? m.id : undefined,
        localId: nextLocalId(),
        from: "assistant" as const,
        text: part.trim(),
        suggestedReplies: i === arr.length - 1 ? (m.suggested_replies ?? null) : null,
        scenarioResult: i === arr.length - 1 ? (m.tool_result ?? null) : null,
      }));
    }
    return [{ id: m.id, localId: nextLocalId(), from: m.role, text: m.content, suggestedReplies: m.suggested_replies ?? null, scenarioResult: m.tool_result ?? null }];
  });
}

interface ChatResponse {
  message?: string;
  error?: string;
  suggested_replies?: string[] | null;
  scenarioResult?: ScenarioResult | null;
  scenarioPending?: Record<string, unknown> | null;
  remaining?: number;
  analyticsEvent?: string;
  /** Optional numeric properties attached to analyticsEvent (e.g.
   * minutes_since_signup on first_asset_added). */
  analyticsProps?: Record<string, number>;
  assets?: unknown;
  /** Explicit signal that the portfolio mutated this turn; preferred over
   * inferring from `assets` for cache invalidation. */
  portfolioChanged?: boolean;
}

const ROUND_AMOUNT: Record<DisplayCurrency, number> = {
  EUR: 10_000,
  USD: 10_000,
  GBP: 10_000,
};

const ROUND_SYMBOL: Record<DisplayCurrency, string> = {
  EUR: "€", USD: "$", GBP: "£",
};

export function getChatSuggestions(
  displayCurrency: DisplayCurrency,
  hasPortfolio: boolean,
): string[] {
  if (!hasPortfolio) {
    return [
      "List the stocks I own",
      "Add a property",
      "I have €25,000 in savings",
      "Paste a broker screenshot",
    ];
  }
  const sym = ROUND_SYMBOL[displayCurrency];
  const amt = ROUND_AMOUNT[displayCurrency].toLocaleString("en");
  return [
    "How diversified am I?",
    `Add ${sym}${amt} in S&P 500 ETF`,
    "What is my largest position?",
    "What if markets drop 20%?",
  ];
}

// Shared across ChatPopup and /chat so history persists between surfaces
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const CSV_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);
const isCsvFile = (f: File) => CSV_TYPES.has(f.type) || /\.csv$/i.test(f.name);
const isPdfFile = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });

// Downscale + re-encode an image entirely in the browser BEFORE upload. A phone
// screenshot (2–4 MB PNG) becomes a ~250 KB JPEG: it keeps the whole request under
// the serverless body limit, stays inside Anthropic's per-image bounds, and cuts
// vision-token cost ~3×, with no visible loss for reading holdings. Returns null
// on an unreadable/oversized original so the caller can surface a message.
async function compressImageFile(
  file: File,
): Promise<{ base64: string; mediaType: string; previewUrl: string } | null> {
  // Reject a monster original before decoding it — a huge bitmap can OOM the
  // mobile webview's canvas.
  if (file.size > CHAT_IMAGE_MAX_INPUT_MB * 1024 * 1024) return null;
  try {
    const srcUrl = await readDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = srcUrl;
    });
    let { width, height } = img;
    if (!width || !height) return null;
    const longEdge = Math.max(width, height);
    if (longEdge > CHAT_IMAGE_MAX_EDGE_PX) {
      const scale = CHAT_IMAGE_MAX_EDGE_PX / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White backdrop so a transparent PNG doesn't flatten to black under JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const outUrl = canvas.toDataURL("image/jpeg", CHAT_IMAGE_JPEG_QUALITY);
    const base64 = outUrl.split(",")[1] ?? "";
    if (!base64) return null;
    return { base64, mediaType: "image/jpeg", previewUrl: outUrl };
  } catch {
    return null;
  }
}

// PDF: passed to the model as a document block (it extracts the text/tables). No
// compression is possible, so this is the one attachment bounded purely by size.
async function readPdfFile(file: File): Promise<{ name: string; base64: string } | null> {
  if (file.size > CHAT_PDF_MAX_MB * 1024 * 1024) return null;
  try {
    const base64 = (await readDataUrl(file)).split(",")[1] ?? "";
    return base64 ? { name: file.name, base64 } : null;
  } catch {
    return null;
  }
}

// CSV: parsed to plain text and sent as a normal text turn (a model can't "see" a
// CSV as an image). Capped by both raw bytes and row count so a transaction-heavy
// export can't blow the context budget.
async function readCsvFile(file: File): Promise<{ name: string; text: string } | null> {
  if (file.size > CHAT_CSV_MAX_BYTES) return null;
  try {
    const raw = await file.text();
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const kept = lines.slice(0, CHAT_CSV_MAX_ROWS + 1); // +1 for a header row
    let text = kept.join("\n");
    if (lines.length > kept.length) text += `\n… (${lines.length - kept.length} more rows not shown)`;
    if (text.length > CHAT_CSV_MAX_TEXT_LEN) text = text.slice(0, CHAT_CSV_MAX_TEXT_LEN) + "\n… (truncated)";
    return { name: file.name, text };
  } catch {
    return null;
  }
}

interface Options {
  userId: string | undefined;
  onPortfolioUpdate?: () => void;
  onNewMessage?: () => void;
}

export function useChatSession({ userId, onPortfolioUpdate, onNewMessage }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageData, setImageData] = useState<Array<{ base64: string; mediaType: string }>>([]);
  const [pdfData, setPdfData] = useState<Array<{ name: string; base64: string }>>([]);
  const [csvData, setCsvData] = useState<Array<{ name: string; text: string }>>([]);
  // Transient "that file didn't work" message, shown under the composer and
  // cleared the moment the user tries another attachment or sends.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreInFlight = useRef(false);
  // Synchronous guard against a double-send race: the `loading` state is async,
  // so two fast taps can both pass its check and fire two POSTs. This ref flips
  // synchronously, so the second tap bails before a second request goes out.
  const sendInFlightRef = useRef(false);
  // Free-typed scenario awaiting a [Show me] confirmation; echoed back to compute.
  const pendingScenarioRef = useRef<Record<string, unknown> | null>(null);
  // Latest messages, for callbacks that shouldn't re-create when messages change.
  const messagesRef = useRef<ChatMessage[]>([]);

  // Use refs for callbacks so send() doesn't recreate when parent re-renders
  const onPortfolioUpdateRef = useRef(onPortfolioUpdate);
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => { onPortfolioUpdateRef.current = onPortfolioUpdate; }, [onPortfolioUpdate]);
  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!userId) return;

    const key = chatHistoryCacheKey(userId);
    const controller = new AbortController();
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    // --- Load localStorage (instant display) ---
    let cached: ChatMessage[] = [];
    try {
      // Sweep any keys belonging to other users (check both old and new prefix)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(CHAT_HISTORY_PREFIX) || k.startsWith("volnar_chat_history_")) && k !== key) {
          localStorage.removeItem(k);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw) {
        const { messages: stored, ts } = JSON.parse(raw) as { messages: ChatMessage[]; ts: number };
        if (Date.now() - ts < CHAT_TTL_MS) {
          if (stored.length > 0) {
            // Backfill stable keys for cache entries written before localId
            // existed, then advance the seq past restored ids so freshly-minted
            // keys can't collide with them.
            cached = stored.map((m) => (m.localId ? m : { ...m, localId: nextLocalId() }));
            setMessages(cached);
          }
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {}

    const fetchDb = async (): Promise<ChatMessage[] | null> => {
      const r = await apiFetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}`, { signal: controller.signal });
      const data = await r.json();
      if (!Array.isArray(data?.messages)) return null;
      if (data.messages.length === 0) { if (!cancelled) setHasMore(false); return []; }
      const mapped = mapDbMessages(data.messages);
      if (data.messages.length < CHAT_LOAD_LIMIT && !cancelled) setHasMore(false);
      return mapped;
    };

    // A cached thread that ends with a USER turn means a send didn't get its
    // answer persisted on THIS surface — i.e. the user switched tabs mid-request,
    // unmounting the component so its setMessages/localStorage write were no-ops.
    // The answer is saved server-side regardless, so re-show the waiting state
    // and poll the DB until the pending turn commits (a message newer than the
    // last one we already have), then adopt the reconciled thread.
    const last = cached[cached.length - 1];
    const awaitingReply = cached.length > 0 && last?.from === "user";
    const lastCommittedId = [...cached].reverse().find((m) => m.id)?.id ?? null;

    if (cached.length === 0) {
      // No usable cache — plain DB load.
      fetchDb()
        .then((mapped) => { if (mapped && mapped.length > 0 && !cancelled) setMessages(mapped); })
        .catch((err) => { if (err?.name !== "AbortError") console.error("Chat history fetch failed:", err); });
    } else if (awaitingReply) {
      setLoading(true);
      setThinking(true);
      const startedAt = Date.now();
      const poll = async () => {
        if (cancelled) return;
        let mapped: ChatMessage[] | null = null;
        try { mapped = await fetchDb(); }
        catch (err) { if ((err as { name?: string })?.name === "AbortError") return; }
        if (cancelled) return;
        const newestDbId = mapped ? ([...mapped].reverse().find((m) => m.id)?.id ?? null) : null;
        const committed = !!mapped && mapped.length > 0 && newestDbId !== lastCommittedId;
        if (committed) {
          setMessages(mapped!);
          setLoading(false);
          setThinking(false);
          return;
        }
        if (Date.now() - startedAt < 75_000) {
          pollTimer = setTimeout(poll, 2500);
        } else {
          // Gave up — the request likely failed. Stop the spinner; the user's
          // message stays in the thread so they can re-ask.
          setLoading(false);
          setThinking(false);
        }
      };
      poll();
    }

    return () => { cancelled = true; controller.abort(); if (pollTimer) clearTimeout(pollTimer); };
  }, [userId]);

  // Write only the latest CHAT_LOAD_LIMIT messages to localStorage — older paginated history stays out of the cache.
  useEffect(() => {
    if (!userId) return;
    try {
      const latest = messages.slice(-CHAT_LOAD_LIMIT);
      const stripped = latest.map(({ id, localId, from, text, suggestedReplies, scenarioResult }) => ({ id, localId, from, text, suggestedReplies, scenarioResult }));
      localStorage.setItem(chatHistoryCacheKey(userId), JSON.stringify({ messages: stripped, ts: Date.now() }));
    } catch {}
  }, [messages, userId]);

  const loadMore = useCallback(async () => {
    if (!userId || loadMoreInFlight.current || !hasMore) return;
    const oldestId = messages.find((m) => m.id)?.id;
    if (!oldestId) return;

    loadMoreInFlight.current = true;
    setIsLoadingMore(true);

    try {
      const res = await apiFetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}&before=${oldestId}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.messages)) return;

      if (data.messages.length === 0) {
        setHasMore(false);
        return;
      }

      const older = mapDbMessages(data.messages);

      setMessages((prev) => [...older, ...prev]);
      if (data.messages.length < CHAT_LOAD_LIMIT) setHasMore(false);
    } catch {
      // silently fail
    } finally {
      loadMoreInFlight.current = false;
      setIsLoadingMore(false);
    }
  }, [userId, hasMore, messages]);

  const MAX_IMAGES = 5;

  const clearImage = useCallback(() => {
    setImagePreviews([]);
    setImageData([]);
    setPdfData([]);
    setCsvData([]);
    setAttachmentError(null);
  }, []);

  const removeImage = useCallback((index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setImageData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePdf = useCallback((index: number) => {
    setPdfData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeCsv = useCallback((index: number) => {
    setCsvData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Single entry point for the picker, drag-drop, and the empty-state hand-off.
  // Routes by file kind, does all validation + compression up front, and — unlike
  // before — tells the user when something is rejected instead of silently
  // dropping it. Async because image compression and file reads are async.
  const handleFile = useCallback(async (file: File) => {
    setAttachmentError(null);
    if (isPdfFile(file)) {
      const pdf = await readPdfFile(file);
      if (!pdf) { setAttachmentError(`That PDF is over ${CHAT_PDF_MAX_MB} MB — send the holdings page as a screenshot, or a smaller PDF.`); return; }
      setPdfData((prev) => (prev.length < 2 ? [...prev, pdf] : prev));
      return;
    }
    if (isCsvFile(file)) {
      const csv = await readCsvFile(file);
      if (!csv) { setAttachmentError("That CSV is too large — export just your holdings, or send a screenshot."); return; }
      setCsvData((prev) => (prev.length < 2 ? [...prev, csv] : prev));
      return;
    }
    if (ALLOWED_IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|gif|webp)$/i.test(file.name)) {
      const compressed = await compressImageFile(file);
      if (!compressed) { setAttachmentError("Couldn't read that image — it may be too large or corrupted."); return; }
      setImageData((prev) => (prev.length < MAX_IMAGES ? [...prev, { base64: compressed.base64, mediaType: compressed.mediaType }] : prev));
      setImagePreviews((prev) => (prev.length < MAX_IMAGES ? [...prev, compressed.previewUrl] : prev));
      return;
    }
    setAttachmentError("Unsupported file. Attach an image, a PDF statement, or a CSV export.");
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (ALLOWED_IMAGE_TYPES.has(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void handleFile(file);
        break;
      }
    }
  }, [handleFile]);

  // Map a chat API response into assistant messages, attaching any inline
  // scenario card to the final part and capturing a pending free-typed intent.
  const applyAssistantResponse = useCallback((data: ChatResponse) => {
    const parts = (data.message || "Done.").split("\n---\n").map((p) => p.trim()).filter(Boolean);
    const newMsgs: ChatMessage[] = parts.map((p, i) => ({
      localId: nextLocalId(),
      from: "assistant" as const,
      text: p,
      suggestedReplies: i === parts.length - 1 && data.suggested_replies ? data.suggested_replies : null,
      scenarioResult: i === parts.length - 1 && data.scenarioResult ? data.scenarioResult : null,
    }));
    setMessages((prev) => [...prev, ...newMsgs]);
    if (typeof data.remaining === "number") setRemaining(data.remaining);
    pendingScenarioRef.current = data.scenarioPending ?? null;
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    const hasAttachment = imageData.length > 0 || pdfData.length > 0 || csvData.length > 0;
    if ((!text && !hasAttachment) || loading || !userId) return;
    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    const attachmentCount = imageData.length + pdfData.length + csvData.length;
    const displayText = text || (
      imageData.length > 0 && pdfData.length === 0 && csvData.length === 0
        ? (imageData.length > 1 ? "Screenshots uploaded" : "Screenshot uploaded")
        : attachmentCount > 1 ? "Files uploaded" : "File uploaded"
    );
    const userMsg: ChatMessage = { localId: nextLocalId(), from: "user", text: displayText };
    if (imagePreviews.length > 0) userMsg.imagePreviews = imagePreviews;

    setInput("");
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, userMsg]);

    const payload: {
      message: string;
      images?: Array<{ base64: string; mediaType: string }>;
      pdfs?: Array<{ base64: string }>;
      csvText?: string;
    } = { message: text };
    if (imageData.length > 0) payload.images = imageData;
    if (pdfData.length > 0) payload.pdfs = pdfData.map((p) => ({ base64: p.base64 }));
    if (csvData.length > 0) {
      payload.csvText = csvData.map((c) => `--- ${c.name} ---\n${c.text}`).join("\n\n");
    }
    clearImage();

    // Only fetch + parse + non-ok handling live in the try/catch. A throw from a
    // post-success side-effect (track / cache invalidation / callback) must NOT
    // surface a "Connection issue" bubble after the answer already rendered.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fromChip: false }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        if (typeof data?.remaining === "number") setRemaining(data.remaining);
        // Restore the composer so the user's text isn't lost and can be retried,
        // and drop the orphaned optimistic user bubble.
        setInput(text);
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch {
      setThinking(false);
      // Restore the composer so the user's text isn't lost and can be retried,
      // and drop the orphaned optimistic user bubble.
      setInput(text);
      setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
      setMessages((prev) => [
        ...prev,
        { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." },
      ]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    // Success side-effects — outside the catch so a throw here can't render a
    // spurious connection-error bubble after the answer was already shown.
    applyAssistantResponse(data);
    if (data.analyticsEvent) track(data.analyticsEvent, data.analyticsProps);
    if (data.portfolioChanged ?? !!data.assets) {
      if (userId) invalidateAssetsCache(userId);
      invalidateInsightCache();
      invalidateVitalsCache();
      // Bump the shared revision so every mounted surface (Portfolio, Vitals,
      // Diary, Profile) refetches without a manual refresh.
      bumpPortfolioRevision();
      onPortfolioUpdateRef.current?.();
    }
    onNewMessageRef.current?.();
  }, [input, imageData, imagePreviews, pdfData, csvData, loading, userId, clearImage, applyAssistantResponse]);

  // Confirm a free-typed scenario ([Show me]): echo the pending intent back so the
  // route computes and renders the card directly, skipping Claude classification.
  const sendScenarioConfirm = useCallback(async (pending: Record<string, unknown>, originalText: string) => {
    if (loading || !userId) return;
    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setLoading(true);
    setThinking(true);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioConfirm: pending, message: originalText }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);
      if (!res.ok) {
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: data.message || "Something went wrong. Please try again." }]);
        return;
      }
    } catch {
      setThinking(false);
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." }]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    applyAssistantResponse(data);
    onNewMessageRef.current?.();
  }, [loading, userId, applyAssistantResponse]);

  // Send a specific text string without going through the input state — used by
  // suggestion chips. Chip taps are flagged (fromChip) so scenario intents compute
  // directly rather than asking to confirm.
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !userId) return;

    // [Show me] / [Change it] on a pending free-typed scenario.
    const pending = pendingScenarioRef.current;
    if (pending && trimmed === "Show me") {
      pendingScenarioRef.current = null;
      const original = messagesRef.current.filter((m) => m.from === "user").slice(-1)[0]?.text ?? "Scenario";
      return sendScenarioConfirm(pending, original);
    }
    if (pending && trimmed === "Change it") {
      pendingScenarioRef.current = null;
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Sure — tell me the scenario you'd like to see." }]);
      return;
    }

    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    const userMsg: ChatMessage = { localId: nextLocalId(), from: "user", text: trimmed };
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, userMsg]);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, fromChip: true }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        if (typeof data?.remaining === "number") setRemaining(data.remaining);
        // Restore the composer so the chip text isn't lost, and drop the
        // orphaned optimistic user bubble.
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch {
      setThinking(false);
      // Restore the composer so the chip text isn't lost, and drop the
      // orphaned optimistic user bubble.
      setInput(trimmed);
      setMessages((prev) => prev.filter((m) => m.localId !== userMsg.localId));
      setMessages((prev) => [
        ...prev,
        { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." },
      ]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    // Success side-effects — outside the catch so a throw here can't render a
    // spurious connection-error bubble after the answer was already shown.
    applyAssistantResponse(data);
    if (data.analyticsEvent) track(data.analyticsEvent, data.analyticsProps);
    if (data.portfolioChanged ?? !!data.assets) {
      if (userId) invalidateAssetsCache(userId);
      invalidateInsightCache();
      invalidateVitalsCache();
      // Bump the shared revision so every mounted surface (Portfolio, Vitals,
      // Diary, Profile) refetches without a manual refresh.
      bumpPortfolioRevision();
      onPortfolioUpdateRef.current?.();
    }
    onNewMessageRef.current?.();
  }, [loading, userId, applyAssistantResponse, sendScenarioConfirm]);

  // Scenario-narration handoff: posts the summarising user turn + the
  // guardrailed assistant narration into this single thread. No portfolio
  // mutation occurs (the route never enters the mutation flow).
  const sendScenario = useCallback(async (h: ScenarioHandoff) => {
    if (loading || !userId) return;
    // Synchronous double-send guard (see sendInFlightRef).
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, { localId: nextLocalId(), from: "user", text: h.userMessage }]);

    // Only fetch + parse + non-ok handling live in the try/catch; success
    // side-effects run after so a throw there can't surface a connection error.
    let data: ChatResponse;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioHandoff: h }),
        timeoutMs: 60000,
      });
      data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: errText }]);
        return;
      }
    } catch {
      setThinking(false);
      setMessages((prev) => [...prev, { localId: nextLocalId(), from: "assistant", text: "Connection issue. Please try again." }]);
      return;
    } finally {
      setLoading(false);
      sendInFlightRef.current = false;
    }

    const parts = (data.message || "Done.").split("\n---\n").map((p: string) => p.trim()).filter(Boolean);
    const newMsgs: ChatMessage[] = parts.map((p: string) => ({ localId: nextLocalId(), from: "assistant" as const, text: p, suggestedReplies: null }));
    setMessages((prev) => [...prev, ...newMsgs]);
    if (typeof data.remaining === "number") setRemaining(data.remaining);
    onNewMessageRef.current?.();
  }, [loading, userId]);

  return {
    messages,
    input,
    setInput,
    loading,
    thinking,
    remaining,
    imagePreviews,
    imageData,
    pdfData,
    csvData,
    attachmentError,
    canSend: !loading && !!(input.trim() || imageData.length || pdfData.length || csvData.length) && (remaining === null || remaining > 0),
    send,
    sendText,
    sendScenario,
    clearImage,
    removeImage,
    removePdf,
    removeCsv,
    handlePaste,
    handleFile,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}
