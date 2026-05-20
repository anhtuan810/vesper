export function PullQuote() {
  return (
    <>
      <div className="max-w-[1200px] mx-auto" style={{ padding: "0 var(--wrap-pad)" }}>
        <div className="pull-quote reveal">
          <span className="pq-mark">&ldquo;</span>
          <p className="font-serif font-medium text-hero leading-[1.2] tracking-[-0.02em]"
            style={{ fontSize: "clamp(22px,4.5vw,34px)", fontVariationSettings: "'opsz' 36" }}
          >
            Wealth tells you what&apos;s worth knowing.<br />
            <span className="italic font-normal text-dim">You decide what&apos;s worth doing.</span>
          </p>
        </div>
      </div>

      <div className="divider-diamond" aria-hidden="true">
        <span className="divider-diamond-dot" />
      </div>
    </>
  );
}
