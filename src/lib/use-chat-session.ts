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
const STORAGE_KEY = "vesper_chat_history";
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { messages: stored, ts } = JSON.parse(raw) as { messages: ChatMessage[]; ts: number };
        if (Date.now() - ts < CHAT_TTL_MS) setMessages(stored);
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, ts: Date.now() })); } catch {}
  }, [messages]);

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
