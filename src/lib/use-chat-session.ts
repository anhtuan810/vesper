"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface ChatMessage {
  from: "user" | "assistant";
  text: string;
}

export const CHAT_SUGGESTIONS = [
  "How diversified am I?",
  "Add €10k in S&P 500 ETF",
  "What is my largest position?",
  "What if markets drop 20%?",
];

// Shared across ChatPopup and /chat so history persists between surfaces
const storageKey = (uid: string) => "vesper_chat_history_" + uid;
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mediaType: string } | null>(null);

  // Use refs for callbacks so send() doesn't recreate when parent re-renders
  const onPortfolioUpdateRef = useRef(onPortfolioUpdate);
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => { onPortfolioUpdateRef.current = onPortfolioUpdate; }, [onPortfolioUpdate]);
  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);

  useEffect(() => {
    if (!userId) return;

    const key = storageKey(userId);
    let hasHistory = false;
    const controller = new AbortController();

    try {
      // Sweep any keys belonging to other users
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("vesper_chat_history_") && k !== key) {
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
    // setMessages() here triggers the write effect, which caches the result
    // automatically with a fresh timestamp — no explicit localStorage.setItem needed.
    if (!hasHistory) {
      fetch("/api/messages?limit=20", { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!Array.isArray(data?.messages) || data.messages.length === 0) return;
          const mapped: ChatMessage[] = data.messages.map(
            (m: { role: "user" | "assistant"; content: string }) => ({
              from: m.role,
              text: m.content,
            })
          );
          setMessages(mapped);
        })
        .catch(() => {});
    }

    return () => { controller.abort(); };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    try { localStorage.setItem(storageKey(userId), JSON.stringify({ messages, ts: Date.now() })); } catch {}
  }, [messages, userId]);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setImageData(null);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    for (const item of items) {
      if (ALLOWED_IMAGE_TYPES.has(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file || file.size > 5 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setImageData({ base64: result.split(",")[1], mediaType: item.type });
          setImagePreview(result);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageData) || loading || !userId) return;

    const displayText = text || "Screenshot uploaded";
    setInput("");
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, { from: "user", text: displayText }]);

    const payload: { message: string; imageData?: { base64: string; mediaType: string } } = { message: text };
    if (imageData) payload.imageData = imageData;
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
          : data.message || "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, { from: "assistant", text: errText }]);
        setLoading(false);
        return;
      }

      setMessages((prev) => [...prev, { from: "assistant", text: data.message || "Done." }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.assets) onPortfolioUpdateRef.current?.();
      onNewMessageRef.current?.();
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { from: "assistant", text: "Connection issue. Please try again." },
      ]);
    }
    setLoading(false);
  }, [input, imageData, loading, userId, clearImage]);

  return {
    messages,
    input,
    setInput,
    loading,
    thinking,
    remaining,
    imagePreview,
    imageData,
    canSend: !loading && !!(input.trim() || imageData),
    send,
    clearImage,
    handlePaste,
  };
}
