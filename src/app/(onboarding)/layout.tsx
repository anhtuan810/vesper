// Bare layout for the gated onboarding flow. It renders no app chrome of its own:
// the mobile BottomNav self-hides on /onboarding, and the desktop WebShell only
// exists inside the (main) group, so neither reaches this route. The middleware gate
// keeps the rest of the app unreachable while the onboarding flag is null, so this is
// the only surface a not-yet-onboarded user can see. Chat-only, no nav, no sidebar.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh]">{children}</div>;
}
