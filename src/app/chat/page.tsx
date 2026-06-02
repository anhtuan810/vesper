"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useDisplayCurrency, useAssets } from "@/lib/hooks";
import { ChatThread, type ChatThreadHandle } from "@/components/chat/ChatThread";
import { useChatSession, getChatSuggestions } from "@/lib/use-chat-session";
import { getChatSeed, type ChatSeed, type SeedSource } from "@/lib/chat-seeds";

export default function ChatPage() {
  const router = useRouter();
  const { user } = useUser();
  const displayCurrency = useDisplayCurrency();
  const { assets, loading: assetsLoading } = useAssets(user?.id);
  const hasPortfolio = assets.length > 0;
  const chatSuggestions = getChatSuggestions(displayCurrency, hasPortfolio);
  const session = useChatSession({ userId: user?.id });
  const {
    messages, setInput, thinking, imageData, send, handleFile,
    loadMore, hasMore, isLoadingMore,
  } = session;

  const threadRef = useRef<ChatThreadHandle>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const isLoadMoreUpdate = useRef(false);
  const savedScrollMetrics = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const hasScrolled = useRef(false);
  const autoSubmitRef = useRef(false);

  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<ChatSeed | null>(null);
  const [pendingSeed, setPendingSeed] = useState<{ source: SeedSource; key: string } | null>(null);

  // Restore scroll position after prepending older messages (loadMore).
  // useLayoutEffect runs before paint so there's no visible jump.
  useLayoutEffect(() => {
    const metrics = savedScrollMetrics.current;
    const container = scrollContainerRef.current;
    if (!metrics || !container) return;
    container.scrollTop = container.scrollTop + (container.scrollHeight - metrics.scrollHeight);
    savedScrollMetrics.current = null;
  }, [messages]);

  useEffect(() => {
    if (isLoadMoreUpdate.current) {
      isLoadMoreUpdate.current = false;
      return;
    }
    if (!bottomRef.current) return;
    if (!initialScrollDone.current && messages.length > 0) {
      bottomRef.current.scrollIntoView({ behavior: "instant" });
      initialScrollDone.current = true;
    } else if (initialScrollDone.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking]);

  // Lock document scroll for the lifetime of the route. This stops the iOS
  // keyboard from scrolling the body (sliding content under the status bar)
  // and prevents any scroll offset from carrying over to the next tab.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, 0);
      // Clear the keyboard flag so the BottomNav reappears on other routes.
      document.documentElement.dataset.kb = "";
    };
  }, []);

  // Reads window.location.search directly to avoid the Suspense requirement of useSearchParams.
  // Runs once on mount; replaces the URL to prevent re-trigger on back-nav.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get("asset");
    const seedParam = params.get("seed") as SeedSource | null;
    const keyParam = params.get("key");
    const src = params.get("source");
    if (src) setSource(src);

    // Text typed in the portfolio empty-state input
    const prefill = sessionStorage.getItem("volnar.empty.input");
    if (prefill) {
      sessionStorage.removeItem("volnar.empty.input");
      setInput(prefill);
      setTimeout(() => threadRef.current?.focus(), 100);
    }

    // Image/file picked in the portfolio empty-state
    const storedImage = sessionStorage.getItem("volnar.empty.image");
    if (storedImage) {
      sessionStorage.removeItem("volnar.empty.image");
      const shouldAutoSubmit = sessionStorage.getItem("volnar.chat.autosubmit") === "1";
      sessionStorage.removeItem("volnar.chat.autosubmit");
      if (shouldAutoSubmit) autoSubmitRef.current = true;
      try {
        const { base64, mediaType } = JSON.parse(storedImage);
        const bytes = atob(base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        handleFile(new File([arr], "upload", { type: mediaType }));
      } catch {}
    }
    if (assetId) {
      // Legacy ?asset=<id> path — defer until assets load
      setPendingAssetId(assetId);
      router.replace("/chat", { scroll: false });
    } else if (seedParam && keyParam) {
      if (seedParam === "asset") {
        // Defer until assets load to build the message from asset name
        setPendingSeed({ source: seedParam, key: keyParam });
      } else if (seedParam === "insight") {
        const msg = sessionStorage.getItem("volnar.insight.seed") || "";
        sessionStorage.removeItem("volnar.insight.seed");
        const seed = getChatSeed("insight", keyParam, msg || undefined);
        if (seed) setSeedMessage(seed);
      } else {
        const seed = getChatSeed(seedParam, keyParam);
        if (seed) setSeedMessage(seed);
      }
      router.replace("/chat", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-send when an image from the empty-state input lands in the composer
  useEffect(() => {
    if (!autoSubmitRef.current || !imageData.length) return;
    autoSubmitRef.current = false;
    send();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData]);

  // Clear seed when the user sends their first message (typed or chip tap).
  useEffect(() => {
    if (!seedMessage) return;
    const latestMsg = messages[messages.length - 1];
    if (latestMsg?.from === "user") setSeedMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore && hasScrolled.current) {
          const container = scrollContainerRef.current;
          if (container) {
            savedScrollMetrics.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
          }
          isLoadMoreUpdate.current = true;
          loadMore();
        }
      },
      { threshold: 0, rootMargin: "200px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // When assets finish loading, resolve pending asset seed (new path) or legacy pre-fill.
  useEffect(() => {
    if (assetsLoading) return;
    if (pendingSeed?.source === "asset") {
      const found = assets.find((a) => a.id === pendingSeed.key);
      setPendingSeed(null);
      if (found) {
        const seed = getChatSeed("asset", found.id, `What would you like to know about ${found.name}?`);
        if (seed) setSeedMessage(seed);
      }
    } else if (pendingAssetId) {
      const found = assets.find((a) => a.id === pendingAssetId);
      setPendingAssetId(null);
      if (found) {
        const seed = getChatSeed("asset", found.id, `What would you like to know about ${found.name}?`);
        if (seed) setSeedMessage(seed);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAssetId, pendingSeed, assetsLoading]);

  return (
    <>
      <style>{`
        @keyframes up { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.2}50%{opacity:1} }
        .chat-msg { animation: up 0.25s ease forwards; }
        .chat-dot { display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite;margin:0 2px; }
        .chat-dot:nth-child(2){animation-delay:.2s}.chat-dot:nth-child(3){animation-delay:.4s}
        .chat-composer-gradient {
          background: linear-gradient(180deg, rgba(245,241,234,0) 0%, var(--bg) 30%, var(--bg) 100%);
        }
        [data-theme="dark"] .chat-composer-gradient {
          background: linear-gradient(180deg, rgba(20,17,13,0) 0%, var(--bg) 30%, var(--bg) 100%);
        }
      `}</style>

      <div
        className="flex flex-col overflow-hidden bg-bg"
        style={{
          position: "fixed",
          inset: 0,
          height: "100dvh",
          // Keep the shared layout's centered column + horizontal inset, which
          // fixed positioning would otherwise escape.
          maxWidth: 720,
          margin: "0 auto",
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        <ChatThread
          variant="page"
          session={session}
          seedMessage={seedMessage}
          chatSuggestions={chatSuggestions}
          hasPortfolio={hasPortfolio}
          source={source}
          scrollContainerRef={scrollContainerRef}
          sentinelRef={sentinelRef}
          bottomRef={bottomRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop > 0) hasScrolled.current = true;
          }}
          ref={threadRef}
        />
      </div>
    </>
  );
}
