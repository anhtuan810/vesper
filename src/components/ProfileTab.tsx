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
      <div className="bg-white rounded-2xl border border-black/5 p-8 mb-4">
        <div className="flex items-start gap-4 mb-6">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-xl" />
          )}
          <div>
            <div className="text-xl font-bold tracking-tight text-[#0F0E0C]">
              {profile?.name || "Investor"}
            </div>
            <div className="text-xs text-gray-400 mt-1">What Vesper knows about you</div>
          </div>
        </div>

        <div className="text-xs text-gray-300 leading-relaxed mb-6">
          This profile builds automatically from your conversations. The more you use Vesper, the better it understands your financial situation and preferences.
        </div>

        {Object.keys(profileData).length > 0 ? (
          <div className="space-y-4">
            {PROFILE_FIELDS.filter(({ key }) => profileData[key]).map(({ key, label }) => (
              <div key={key} className="border-b border-black/[0.03] pb-4 last:border-0 last:pb-0">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  {label}
                </div>
                <div className="text-sm text-[#0F0E0C] leading-relaxed">
                  {profileData[key]}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <div className="text-sm text-gray-400 mb-2">No profile data yet</div>
            <div className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
              Start chatting with the assistant about your investments, goals, and concerns. Vesper will gradually learn about your financial profile.
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 border border-black/5">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Conversations</div>
          <div className="text-2xl font-extrabold tracking-tight text-[#0F0E0C]">{mutationCount}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/5">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Profile fields</div>
          <div className="text-2xl font-extrabold tracking-tight text-[#0F0E0C]">
            {Object.keys(profileData).length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-black/5">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Member since</div>
          <div className="text-sm font-extrabold tracking-tight text-[#0F0E0C] mt-1.5">
            {new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>
    </>
  );
}
