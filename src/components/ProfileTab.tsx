"use client";

import type { ProfileData } from "@/lib/hooks";

interface ProfileTabProps {
  profile: ProfileData | null;
  mutationCount: number;
}

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

export function ProfileTab({ profile, mutationCount }: ProfileTabProps) {
  const profileData = profile?.profile ?? {};

  return (
    <>
      <div className="bg-surface rounded-2xl border border-border p-8 mb-4">
        <div className="flex items-start gap-4 mb-6">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-xl" />
          )}
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
                <div
                  className="font-mono text-faint uppercase mb-1.5"
                  style={{ fontSize: 9, letterSpacing: "0.18em" }}
                >
                  {label}
                </div>
                <div className="text-fg leading-relaxed" style={{ fontSize: 13 }}>
                  {profileData[key]}
                </div>
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

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Conversations", value: mutationCount },
          { label: "Profile fields", value: Object.keys(profileData).length },
          {
            label: "Member since",
            value: new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
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
    </>
  );
}
