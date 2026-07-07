"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChatSession } from "@/lib/use-chat-session";
import { useUser } from "@/lib/hooks";

// Holds ONE chat session for the whole authenticated app, mounted above the
// router so it survives navigation. EVERY chat surface reads from here via
// useSharedChatSession — the desktop WebShell rail, the tablet ChatPopup, and the
// mobile /chat route — so there is a single conversation and a single writer to
// the localStorage cache.
//
// Without this, each surface created its own per-mount useChatSession. On desktop
// that reset the rail when a differently-mounted shell took over (Vitals /
// Settings / an asset); on mobile the /chat route's session was destroyed on
// every bottom-nav tab switch and had to be rebuilt from localStorage/DB — the
// thread visibly disappeared/flashed on return, and two sessions racing on the
// same cache key could clobber it. A single hoisted session keeps the thread
// continuous and in-memory across every route on every device.

type ChatSession = ReturnType<typeof useChatSession>;

const ChatSessionContext = createContext<ChatSession | null>(null);

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const session = useChatSession({ userId: user?.id });
  return <ChatSessionContext.Provider value={session}>{children}</ChatSessionContext.Provider>;
}

export function useSharedChatSession(): ChatSession {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error("useSharedChatSession must be used within ChatSessionProvider");
  return ctx;
}
