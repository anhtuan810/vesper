"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FormatText } from "@/components/FormatText";

interface ChatMessage {
  from: "user" | "assistant";
  text: string;
}

interface ChatPopupProps {
  userId?: string;
  isOpen: boolean;
  hasNew: boolean;
  onToggle: () => void;
  onPortfolioUpdate: () => void;
  onNewMessage: () => void;
  onOpen: () => void;
}

const SUGGESTIONS = [
  "How diversified am I?",
  "Add €10k in S&P 500 ETF",
  "What is my largest position?",
  "What if markets drop 20%?",
];

const STORAGE_KEY = "vesper_chat_history";

export default function ChatPopup({
  userId, isOpen, hasNew, onToggle, onPortfolioUpdate, onNewMessage, onOpen,
}: ChatPopupProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mediaType: string } | null>(null);
  const [size, setSize] = useState({ width: 400, height: 560 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* quota exceeded */ }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (isOpen) {
      onOpen();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaX = resizeRef.current.startX - e.clientX;
      const deltaY = resizeRef.current.startY - e.clientY;
      setSize({
        width: Math.max(340, Math.min(700, resizeRef.current.startW + deltaX)),
        height: Math.max(400, Math.min(800, resizeRef.current.startH + deltaY)),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Handle image paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file || file.size > 5 * 1024 * 1024) return;

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          setImageData({ base64, mediaType: item.type });
          setImagePreview(result);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  function clearImage() {
    setImagePreview(null);
    setImageData(null);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !imageData) || loading || !userId) return;

    const displayText = text || "Screenshot uploaded";
    setInput("");
    setLoading(true);
    setThinking(true);
    setMessages((prev) => [...prev, { from: "user", text: displayText }]);

    const payload: { userId: string; message: string; imageData?: { base64: string; mediaType: string } } = { userId, message: text };
    if (imageData) {
      payload.imageData = imageData;
    }
    clearImage();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setThinking(false);
      setMessages((prev) => [...prev, { from: "assistant", text: data.message || "Done." }]);

      if (data.assets) {
        onPortfolioUpdate();
      }
      onNewMessage();
    } catch {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { from: "assistant", text: "Connection issue. Please try again." },
      ]);
    }
    setLoading(false);
  }

  // FAB button
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-8 right-8 w-[52px] h-[52px] rounded-2xl border-none bg-[#2563EB] text-white cursor-pointer flex items-center justify-center text-lg transition-all hover:bg-[#1D4ED8] hover:scale-105"
        style={{ boxShadow: "0 8px 24px rgba(37,99,235,0.35)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {hasNew ? (
          <div className="relative">
            <span>✦</span>
            <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[#2563EB]" />
          </div>
        ) : (
          "✦"
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-8 right-8 bg-white rounded-3xl border border-black/[0.08] flex flex-col overflow-hidden"
      style={{
        width: size.width,
        height: size.height,
        boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
        animation: isResizing ? "none" : "pop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes pop { from{opacity:0;transform:scale(0.95) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:#2563EB;animation:blink 1.2s ease infinite;margin:0 2px; }
        .dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
        .sug:hover { background:#ECEAE4 !important; }
      `}</style>

      {/* Resize handle — top left corner */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          cursor: "nw-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{
          width: 8,
          height: 8,
          borderTop: "2px solid #D1D5DB",
          borderLeft: "2px solid #D1D5DB",
          borderRadius: "2px 0 0 0",
          margin: "4px",
        }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-[#2563EB] flex items-center justify-center text-white text-sm font-bold">
            V
          </div>
          <div>
            <div className="text-sm font-bold text-[#0F0E0C] tracking-tight">Vesper</div>
            <div className="text-[11px] text-gray-400">Portfolio assistant</div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-lg bg-[#F0EEE9] border-none text-gray-400 cursor-pointer flex items-center justify-center text-base hover:bg-[#E5E2DA] transition"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div>
            <div className="text-[13px] text-gray-400 mb-3.5 leading-relaxed">
              Ask about your portfolio, or paste a screenshot of your broker app.
            </div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="sug block w-full text-left px-3 py-2.5 mb-1.5 rounded-[10px] border border-black/[0.06] bg-transparent text-gray-500 text-xs font-medium cursor-pointer transition-colors"
                onClick={() => {
                  setInput(s);
                  inputRef.current?.focus();
                }}
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3.5 py-2.5 text-[13px]"
              style={{
                borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.from === "user" ? "#2563EB" : "#F8F7F4",
                color: msg.from === "user" ? "#fff" : "#4B5563",
                lineHeight: 1.65,
              }}
            >
              {msg.from === "assistant" ? <FormatText text={msg.text} /> : msg.text}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-0.5 py-1">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <img
            src={imagePreview}
            alt="Preview"
            className="w-12 h-12 rounded-lg object-cover border border-black/10"
          />
          <span className="text-xs text-gray-400 flex-1">Screenshot ready to send</span>
          <button
            onClick={clearImage}
            className="text-xs text-gray-300 hover:text-gray-500 cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-black/5 flex gap-2 items-center">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          onPaste={handlePaste}
          placeholder={imageData ? "Add a note or send..." : "Ask or paste a screenshot..."}
          className="flex-1 bg-[#F8F7F4] border-none rounded-xl px-3.5 py-2.5 text-[13px] text-[#0F0E0C] outline-none"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        />
        <button
          onClick={send}
          disabled={loading || (!input.trim() && !imageData)}
          className="w-10 h-10 rounded-xl border-none flex items-center justify-center text-base transition-all shrink-0"
          style={{
            background: loading || (!input.trim() && !imageData) ? "#F0EEE9" : "#2563EB",
            color: loading || (!input.trim() && !imageData) ? "#C4BFB6" : "#fff",
            cursor: loading || (!input.trim() && !imageData) ? "default" : "pointer",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
