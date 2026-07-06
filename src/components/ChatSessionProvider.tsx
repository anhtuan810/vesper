"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChatSession } from "@/lib/use-chat-session";
import { useUser } from "@/lib/hooks";

// Holds ONE chat session for the whole authenticated app, mounted above the
// router so it survives navigation. The desktop WebShell rail reads from here
// (useSharedChatSession) instead of creating its own session per route — without
// this, opening Vitals / Settings / an asset (routes outside the (main) group)
// remounted a fresh WebShell whose session reset: the rail flashed its empty
// suggestion chips, snapped scroll to the bottom, and dropped any older history
// the user had paginated in. A single hoisted session keeps the rail continuous
// across every desktop route.
//
// Mobile (ChatPage / ChatPopup) keeps its own session — those are full-screen and
// never hit the multi-shell problem; this instance simply idles there.

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
