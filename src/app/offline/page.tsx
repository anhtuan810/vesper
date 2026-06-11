import { VolnarLogo } from "@/components/VolnarLogo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm text-center">
        <div className="mb-5 flex justify-center">
          <VolnarLogo size={44} />
        </div>
        <h1 className="font-serif text-2xl text-hero" style={{ fontVariationSettings: "'opsz' 32" }}>
          Volnar can’t connect right now
        </h1>
        <p className="mt-3 text-sm leading-6 text-dim">
          Check your connection and reopen the app. Your portfolio data stays private and unchanged.
        </p>
      </section>
    </main>
  );
}
