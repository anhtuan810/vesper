"use client";

import { fmt, formatDate, getMonthKey, getMonthLabel, ACTION_STYLE, type DashboardMutation } from "@/lib/utils";

interface DiaryTabProps {
  mutations: DashboardMutation[];
  diaryFilter: string;
  setDiaryFilter: (filter: string) => void;
}

export function DiaryTab({ mutations, diaryFilter, setDiaryFilter }: DiaryTabProps) {
  const hasContent = (m: DashboardMutation) =>
    m.before_value != null || m.after_value != null || !!m.personal_context;

  const filteredMutations = mutations
    .filter(hasContent)
    .filter(m => diaryFilter === "all" || m.action === diaryFilter);

  const grouped = filteredMutations.reduce((acc, m) => {
    const key = getMonthKey(m.occurred_at || m.recorded_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, DashboardMutation[]>);

  const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  for (const key of monthKeys) {
    grouped[key].sort((a, b) => {
      const dayA = a.occurred_at ?? a.recorded_at;
      const dayB = b.occurred_at ?? b.recorded_at;
      if (dayA !== dayB) return dayB.localeCompare(dayA);
      return b.recorded_at.localeCompare(a.recorded_at);
    });
  }

  return (
    <>
      {/* Diary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Added", action: "add", color: "#059669" },
          { label: "Updated", action: "edit", color: "#2563EB" },
          { label: "Removed", action: "remove", color: "#DC2626" },
        ].map(({ label, action, color }) => (
          <div key={action} className="bg-white rounded-xl p-4 border border-black/5">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color }}>
              {mutations.filter(m => m.action === action).length}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "all", label: "All" },
          { key: "add", label: "Added" },
          { key: "edit", label: "Updated" },
          { key: "remove", label: "Removed" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setDiaryFilter(key)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition"
            style={{
              background: diaryFilter === key ? "#0F0E0C" : "transparent",
              color: diaryFilter === key ? "#fff" : "#9CA3AF",
              borderColor: diaryFilter === key ? "#0F0E0C" : "rgba(0,0,0,0.06)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredMutations.length === 0 && (
        <div className="text-center pt-16">
          <div className="text-sm text-gray-400 mb-2">No entries yet</div>
          <p className="text-xs text-gray-300">
            Your diary fills up as you add and modify positions through the assistant.
          </p>
        </div>
      )}

      {/* Timeline */}
      {monthKeys.map((monthKey) => (
        <div key={monthKey} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {getMonthLabel(monthKey)}
            </div>
            <div className="flex-1 h-px bg-black/5" />
            <div className="text-[10px] text-gray-300">
              {grouped[monthKey].length} {grouped[monthKey].length === 1 ? "entry" : "entries"}
            </div>
          </div>

          <div className="space-y-2">
            {grouped[monthKey].map((m) => {
              const style = ACTION_STYLE[m.action] || ACTION_STYLE.edit;
              const date = m.occurred_at || m.recorded_at;
              const valueChange = m.action === "edit" && m.before_value != null && m.after_value != null
                ? m.after_value - m.before_value : null;
              const hasValueChange = valueChange !== null && valueChange !== 0;

              return (
                <div
                  key={m.id}
                  className="bg-white rounded-xl border border-black/5 px-5 py-4 hover:border-black/10 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded"
                          style={{ color: style.color, background: style.bg }}
                        >
                          {style.label}
                        </span>
                        <span className="text-sm font-semibold text-[#0F0E0C] truncate">
                          {m.asset_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {m.action === "add" && m.after_value != null && (
                          <span>{fmt(m.after_value)}</span>
                        )}
                        {m.action === "edit" && hasValueChange && m.before_value != null && m.after_value != null && (
                          <span>
                            {fmt(m.before_value)} → {fmt(m.after_value)}
                            <span className="ml-1.5 font-medium"
                              style={{ color: valueChange! >= 0 ? "#059669" : "#DC2626" }}>
                              {valueChange! >= 0 ? "+" : ""}{fmt(valueChange!)}
                            </span>
                          </span>
                        )}
                        {m.action === "remove" && m.before_value != null && (
                          <span>{fmt(m.before_value)}</span>
                        )}
                      </div>

                      {m.personal_context && (
                        <div className="text-xs text-gray-400 mt-2 leading-relaxed italic">
                          &ldquo;{m.personal_context}&rdquo;
                        </div>
                      )}
                      {m.market_context && (
                        <div className="text-[10px] text-gray-300 mt-1.5 leading-relaxed">
                          {m.market_context}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium text-gray-400">
                        {formatDate(date)}
                      </div>
                      {m.portfolio_total != null && (
                        <div className="text-[10px] text-gray-300 mt-1">
                          Total: {fmt(m.portfolio_total)}
                        </div>
                      )}
                    </div>
                  </div>

                  {m.portfolio_total != null && m.portfolio_total > 0 && (
                    <div className="mt-3 h-1 rounded-full bg-[#F0EEE9] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                        style={{
                          width: `${Math.min((m.portfolio_total / (mutations[0]?.portfolio_total || m.portfolio_total)) * 100, 100)}%`,
                          opacity: 0.3,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
