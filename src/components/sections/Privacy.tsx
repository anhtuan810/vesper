export function Privacy() {
  return (
    <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
      <section style={{ paddingBottom: "clamp(48px,7vw,80px)", paddingTop: 0 }}>
        <div className="text-center max-w-[720px] mx-auto" style={{ paddingTop: "clamp(56px,8vw,80px)" }}>
          <h3
            className="font-serif font-medium text-hero leading-[1.2] tracking-[-0.015em]"
            style={{ fontSize: "clamp(22px,4.5vw,30px)" }}
          >
            Your data is yours.{" "}
            <span className="italic font-normal text-dim">Nothing more to say.</span>
          </h3>
          <p
            className="text-dim mt-3 leading-[1.55]"
            style={{ fontSize: "14.5px" }}
          >
            EU-hosted. Encrypted. Self-funded. Read-only by design. Export anytime.
          </p>
        </div>
      </section>
    </div>
  );
}
