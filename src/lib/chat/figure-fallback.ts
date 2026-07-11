// Deterministic figure lines from a read tool's result — the guardrail
// fallback renders THESE instead of a bare "Here's what I found.", so a
// discarded narration still answers the question with verified numbers.
// Pure string assembly over the tool's own forModel payload (whose figures are
// by construction allowlisted); no model, no I/O.

export const READ_TOOLS = new Set(["get_holdings", "get_vitals", "get_net_worth"]);

export function figureLines(tool: string, d: Record<string, unknown>): string {
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    if (typeof v === "string" && v) lines.push(`${label} **${v}**`);
  };

  if (tool === "get_vitals" || tool === "get_net_worth") {
    push("Net worth:", d.netWorth);
    if (Array.isArray(d.allocation)) {
      for (const a of d.allocation as Array<Record<string, unknown>>) {
        if (a && typeof a.category === "string" && typeof a.share === "string") {
          lines.push(`**${a.category}** — **${a.share}**`);
        }
      }
    }
    const conc = d.singleNameConcentration ?? d.topConcentration;
    if (typeof conc === "string" && conc && typeof d.topSingleName === "string" && d.topSingleName) {
      lines.push(`Largest single holding: **${d.topSingleName}** at **${conc}**`);
    }
    push("Mortgage LTV:", d.mortgageLtv ?? d.ltv);
  } else if (tool === "get_holdings" && Array.isArray(d.holdings)) {
    for (const h of (d.holdings as Array<Record<string, unknown>>).slice(0, 15)) {
      if (!h || typeof h.name !== "string" || typeof h.value !== "string") continue;
      const units = typeof h.units === "string" && h.units ? ` (${h.units} units)` : "";
      lines.push(`**${h.name}** — **${h.value}**${units}`);
    }
    push("Net worth:", d.netWorth);
  }
  return lines.join("\n");
}
