"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInsight } from "@/lib/hooks";
import { SwipeExpandCarousel } from "@/components/SwipeExpandCarousel";

// The pre-made question a "Worth knowing" card hands to chat — matched to the
// content the deterministic detectors write about (portfolio-insights.ts:
// concentration / cash drag / currency mismatch, plus the property-anchor
// legacy insight). `label` is the short trigger clause shown on the row;
// `question` is the full standalone question pre-filled into the chat
// composer (it must carry its own context — the model won't see the card).
export function insightQuestion(
  title: string,
  detail: string,
): { label: string; question: string } {
  const t = `${title} ${detail}`.toLowerCase();
  if (/(home|property|real estate|housing)/.test(t)) {
    return {
      label: "What if housing dipped 15%?",
      question: "What if housing dipped 15% — what would it mean for my net worth?",
    };
  }
  if (/(concentrat|biggest|largest|top position|single position)/.test(t)) {
    return {
      label: "What if it dropped 30%?",
      question: "What if my biggest holding dropped 30%?",
    };
  }
  if (/(cash|savings|idle)/.test(t)) {
    return {
      label: "What is this costing me?",
      question: "What is my idle cash costing me — and what if I put part of it to work?",
    };
  }
  if (/(currency|dollar|euro|usd|eur|gbp|exchange)/.test(t)) {
    return {
      label: "What about my currency risk?",
      question: "What does my currency exposure mean for my portfolio?",
    };
  }
  return {
    label: "Why does this matter?",
    question: `${title} — why does this matter for my portfolio?`,
  };
}

// "Worth knowing" — the pulse row for the portfolio insight cards from
// /api/insight (deterministic detectors, phrased by Haiku; or a single legacy
// free-form insight as fallback). One line per card; expanding opens the
// drop-down box with the detail and the row's trigger sentence, which seeds
// chat with a content-fitting question.
export function InsightBand({ onVisibleChange }: { onVisibleChange?: (visible: boolean) => void } = {}) {
  const { insights, loading } = useInsight();
  const router = useRouter();

  useEffect(() => {
    onVisibleChange?.(!loading && insights.length > 0);
  }, [loading, insights.length, onVisibleChange]);

  if (loading) {
    return (
      <div style={{ padding: "var(--space-1) 0" }}>
        <div style={{ height: 9, width: 90, borderRadius: "var(--radius-md)", background: "var(--text-faint)", opacity: 0.15, marginBottom: "var(--space-2)" }} />
        <div style={{ height: 13, width: "75%", borderRadius: "var(--radius-md)", background: "var(--text-faint)", opacity: 0.15 }} />
      </div>
    );
  }

  if (insights.length === 0) return null;

  // Pre-fills the chat composer with the question (volnar.empty.input is the
  // existing prefill channel the chat page reads on mount), so the user lands
  // with the text ready to edit or send — no intermediate seed bubble.
  const askQuestion = (question: string) => {
    try { sessionStorage.setItem("volnar.empty.input", question); } catch {}
    router.push("/chat");
  };

  const items = insights.map((ins) => {
    const { label, question } = insightQuestion(ins.title, ins.detail);
    return {
      title: ins.title,
      detail: ins.detail,
      trigger: { label, onActivate: () => askQuestion(question) },
    };
  });

  return (
    <div style={{ padding: "var(--space-1) 0" }}>
      <SwipeExpandCarousel items={items} />
    </div>
  );
}
