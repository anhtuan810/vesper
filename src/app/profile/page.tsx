"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useProfile, useSignOut } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import { createBrowserSupabase } from "@/lib/supabase";

const supabase = createBrowserSupabase();

const PROFILE_FIELDS = [
  { key: "goal", label: "Financial Goal" },
  { key: "risk_behaviour", label: "Risk Behaviour" },
  { key: "investment_style", label: "Investment Style" },
  { key: "life_context", label: "Life Context" },
  { key: "concerns", label: "Concerns" },
  { key: "preferences", label: "Preferences" },
  { key: "blind_spots", label: "Blind Spots" },
  { key: "decision_patterns", label: "Decision Patterns" },
  { key: "interests", label: "Interests" },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const profile = useProfile(user?.id);
  const signOut = useSignOut();
  const [mutationCount, setMutationCount] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.profile) setProfileData(profile.profile);
  }, [profile]);

  const updateField = useCallback(async (key: string, value: string | null): Promise<string | null> => {
    setPageError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { [key]: value } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error ?? "Save failed";
      }
      setProfileData((prev) => {
        const next = { ...prev };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      });
      return null;
    } catch {
      return "Save failed";
    }
  }, []);

  const handleDelete = useCallback(async (key: string) => {
    const error = await updateField(key, null);
    if (error) setPageError(`Failed to remove ${key}: ${error}`);
  }, [updateField]);

  const fetchMutationCount = useCallback(async () => {
    if (!user?.id) return;
    const { count } = await supabase
      .from("mutations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    setMutationCount(count ?? 0);
  }, [user?.id]);

  useEffect(() => { fetchMutationCount(); }, [fetchMutationCount]);

  const setTab = (t: "portfolio" | "diary" | "profile") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-14 bg-surface border-b border-border" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="profile"
        setTab={setTab}
        mutationCount={mutationCount}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
      />
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 pt-4 pb-24 md:pb-10">
        {/* Profile card */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-4">
          <div className="flex items-start gap-4 mb-6">
            {/* Avatar: photo if available, initials otherwise */}
            <div
              className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: "var(--surface-elev)" }}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-dim" style={{ fontSize: 18, fontWeight: 500 }}>
                  {getInitials(profile?.name || "?")}
                </span>
              )}
            </div>
            <div>
              <div
                className="font-serif text-fg"
                style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", fontVariationSettings: "'opsz' 144" }}
              >
                {profile?.name || "Investor"}
              </div>
              <div className="font-mono text-faint mt-1" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
                What Vesper knows about you
              </div>
            </div>
          </div>

          <div className="text-dim leading-relaxed mb-6" style={{ fontSize: 12 }}>
            This profile builds automatically from your conversations. The more you use Vesper, the better it understands your financial situation and preferences.
          </div>

          {Object.keys(profileData).length > 0 ? (
            <div className="space-y-4">
              {PROFILE_FIELDS.filter(({ key }) => profileData[key]).map(({ key, label }) => (
                <div
                  key={key}
                  className="pb-4 last:pb-0"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className="font-mono text-faint uppercase"
                      style={{ fontSize: 9, letterSpacing: "0.18em" }}
                    >
                      {label}
                    </div>
                    <button
                      onClick={() => handleDelete(key)}
                      aria-label={`Remove ${label}`}
                      className="text-faint hover:text-negative transition-colors"
                      style={{
                        fontSize: 16,
                        lineHeight: 1,
                        padding: "2px 6px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <InlineEdit
                    display={
                      <span className="text-fg leading-relaxed" style={{ fontSize: 13 }}>
                        {profileData[key]}
                      </span>
                    }
                    rawValue={profileData[key] ?? ""}
                    placeholder="(empty)"
                    affordance
                    displayStyle={{ minHeight: 32, width: "100%" }}
                    inputStyle={{ fontSize: 13 }}
                    onSave={async (raw) => {
                      const trimmed = raw.trim();
                      if (trimmed.length > 200) return "Max 200 characters";
                      if (trimmed === (profileData[key] ?? "")) return "";
                      return updateField(key, trimmed === "" ? null : trimmed);
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="text-sm text-dim mb-2">No profile data yet</div>
              <div className="text-faint leading-relaxed max-w-sm mx-auto" style={{ fontSize: 12 }}>
                Start chatting with the assistant about your investments, goals, and concerns. Vesper will gradually learn about your financial profile.
              </div>
            </div>
          )}
        </div>

        {pageError && (
          <div
            className="rounded-xl px-4 py-2 mb-3"
            style={{
              background: "rgba(201,122,110,0.08)",
              border: "1px solid rgba(201,122,110,0.2)",
              color: "var(--negative)",
              fontSize: 11,
            }}
          >
            {pageError}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Activity entries", value: mutationCount },
            { label: "Profile fields", value: Object.keys(profileData).length },
            {
              label: "Member since",
              value: user?.created_at
                ? new Date(user.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                : "—",
            },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface rounded-xl p-4 border border-border">
              <div
                className="font-mono text-faint uppercase mb-2"
                style={{ fontSize: 9, letterSpacing: "0.18em" }}
              >
                {label}
              </div>
              <div className="font-mono text-fg" style={{ fontSize: 17, fontWeight: 500 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Sign out */}
        <div className="mt-10 flex flex-col items-center">
          <button
            onClick={signOut}
            className="font-mono text-faint hover:text-dim border border-border hover:bg-surface transition-colors"
            style={{ fontSize: 11, padding: "8px 20px", borderRadius: 8 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
