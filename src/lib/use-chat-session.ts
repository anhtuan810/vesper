"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { invalidateAssetsCache } from "@/lib/hooks";
import { CHAT_TTL_MS, CHAT_LOAD_LIMIT, chatHistoryCacheKey, CHAT_HISTORY_PREFIX } from "@/lib/constants";

export interface ChatMessage {
  id?: string;
  from: "user" | "assistant";
  text: string;
  imagePreviews?: string[];
  suggestedReplies?: string[] | null;
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
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreInFlight = useRef(false);

  // Use refs for callbacks so send() doesn't recreate when parent re-renders
  const onPortfolioUpdateRef = useRef(onPortfolioUpdate);
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => { onPortfolioUpdateRef.current = onPortfolioUpdate; }, [onPortfolioUpdate]);
  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);

  useEffect(() => {
    if (!userId) return;

    const key = chatHistoryCacheKey(userId);
    let hasHistory = false;
    const controller = new AbortController();

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
            setMessages(stored);
            hasHistory = true;
          }
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {}

    // DB fallback: fires only when localStorage had no usable messages.
    if (!hasHistory) {
      fetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!Array.isArray(data?.messages) || data.messages.length === 0) {
            setHasMore(false);
            return;
          }
          const mapped: ChatMessage[] = data.messages.flatMap(
            (m: { id: string; role: "user" | "assistant"; content: string; suggested_replies?: string[] | null }) => {
              if (m.role === "assistant" && m.content.includes("\n---\n")) {
                return m.content.split("\n---\n").map((part, i, arr) => ({
                  id: i === 0 ? m.id : undefined,
                  from: "assistant" as const,
                  text: part.trim(),
                  suggestedReplies: i === arr.length - 1 ? (m.suggested_replies ?? null) : null,
                }));
              }
              return [{ id: m.id, from: m.role, text: m.content, suggestedReplies: m.suggested_replies ?? null }];
            }
          );
          setMessages(mapped);
          if (data.messages.length < CHAT_LOAD_LIMIT) setHasMore(false);
        })
        .catch((err) => { if (err?.name !== "AbortError") console.error("Chat history fetch failed:", err); });
    }

    return () => { controller.abort(); };
  }, [userId]);

  // Write only the latest CHAT_LOAD_LIMIT messages to localStorage — older paginated history stays out of the cache.
  useEffect(() => {
    if (!userId) return;
    try {
      const latest = messages.slice(-CHAT_LOAD_LIMIT);
      const stripped = latest.map(({ id, from, text, suggestedReplies }) => ({ id, from, text, suggestedReplies }));
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
      const res = await fetch(`/api/messages?limit=${CHAT_LOAD_LIMIT}&before=${oldestId}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.messages)) return;

      if (data.messages.length === 0) {
        setHasMore(false);
        return;
      }

      const older: ChatMessage[] = data.messages.flatMap(
        (m: { id: string; role: "user" | "assistant"; content: string; suggested_replies?: string[] | null }) => {
          if (m.role === "assistant" && m.content.includes("\n---\n")) {
            return m.content.split("\n---\n").map((part: string, i: number, arr: string[]) => ({
              id: i === 0 ? m.id : undefined,
              from: "assistant" as const,
              text: part.trim(),
              suggestedReplies: i === arr.length - 1 ? (m.suggested_replies ?? null) : null,
            }));
          }
          return [{ id: m.id, from: m.role, text: m.content, suggestedReplies: m.suggested_replies ?? null }];
        }
      );

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
  }, []);

  const removeImage = useCallback((index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setImageData((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageData((prev) => prev.length < MAX_IMAGES ? [...prev, { base64: result.split(",")[1], mediaType: file.type }] : prev);
      setImagePreviews((prev) => prev.length < MAX_IMAGES ? [...prev, result] : prev);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (ALLOWED_IMAGE_TYPES.has(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file || file.size > 5 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setImageData((prev) => prev.length < MAX_IMAGES ? [...prev, { base64: result.split(",")[1], mediaType: item.type }] : prev);
          setImagePreviews((prev) => prev.length < MAX_IMAGES ? [...prev, result] : prev);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageData.length) || loading || !userId) return;

    const displayText = text || (imageData.length > 1 ? "Screenshots uploaded" : "Screenshot uploaded");
    const userMsg: ChatMessage = { from: "user", text: displayText };
    if (imagePreviews.length > 0) userMsg.imagePreviews = imagePreviews;

    setInput("");
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, userMsg]);

    const payload: { message: string; images?: Array<{ base64: string; mediaType: string }> } = { message: text };
    if (imageData.length > 0) payload.images = imageData;
    clearImage();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { from: "assistant", text: errText }]);
        setLoading(false);
        return;
      }

      const parts = (data.message || "Done.").split("\n---\n").map((p: string) => p.trim()).filter(Boolean);
      const newMsgs: ChatMessage[] = parts.map((p: string, i: number) => ({
        from: "assistant" as const,
        text: p,
        suggestedReplies: i === parts.length - 1 && data.suggested_replies ? data.suggested_replies : null,
      }));
      setMessages((prev) => [...prev, ...newMsgs]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.assets) {
        if (userId) invalidateAssetsCache(userId);
        onPortfolioUpdateRef.current?.();
      }
      onNewMessageRef.current?.();
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { from: "assistant", text: "Connection issue. Please try again." },
      ]);
    }
    setLoading(false);
  }, [input, imageData, imagePreviews, loading, userId, clearImage]);

  // Send a specific text string without going through the input state — used by suggestion chips.
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !userId) return;

    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, { from: "user", text: trimmed }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      setThinking(false);

      if (!res.ok) {
        const errText = res.status === 401
          ? "Session expired. Please refresh the page."
          : data.message || data.error || "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { from: "assistant", text: errText }]);
        setLoading(false);
        return;
      }

      const parts = (data.message || "Done.").split("\n---\n").map((p: string) => p.trim()).filter(Boolean);
      const newMsgs: ChatMessage[] = parts.map((p: string, i: number) => ({
        from: "assistant" as const,
        text: p,
        suggestedReplies: i === parts.length - 1 && data.suggested_replies ? data.suggested_replies : null,
      }));
      setMessages((prev) => [...prev, ...newMsgs]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.assets) {
        if (userId) invalidateAssetsCache(userId);
        onPortfolioUpdateRef.current?.();
      }
      onNewMessageRef.current?.();
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { from: "assistant", text: "Connection issue. Please try again." },
      ]);
    }
    setLoading(false);
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
    canSend: !loading && !!(input.trim() || imageData.length) && (remaining === null || remaining > 0),
    send,
    sendText,
    clearImage,
    removeImage,
    handlePaste,
    handleFile,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}
