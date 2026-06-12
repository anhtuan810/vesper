import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Volnar",
  description:
    "How Volnar (NovaHub B.V.) collects, uses, and protects your personal data, and the rights you have under the GDPR.",
};

const LAST_UPDATED = "12 June 2026";

export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="legal-top">
        <Link href="/" className="legal-wordmark">
          <span>Volnar</span>
        </Link>
        <Link href="/" className="legal-back">
          ← Back to home
        </Link>
      </div>

      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

      <p className="legal-intro">
        Volnar is a portfolio tracking and intelligence tool operated by{" "}
        <strong>NovaHub B.V.</strong> This policy explains what personal data we
        process when you use Volnar, why we process it, who we share it with, and
        the rights you have under the EU General Data Protection Regulation
        (GDPR). We keep this short and concrete on purpose.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The data controller for your personal data is <strong>NovaHub B.V.</strong>,
        registered with the Dutch Chamber of Commerce (KVK) under number{" "}
        <strong>92194923</strong>, with its registered office in Eindhoven, the
        Netherlands. You can reach us at{" "}
        <a href="mailto:support@novahub.nl">support@novahub.nl</a> for any privacy
        question or to exercise your rights.
      </p>

      <h2>2. What data we process</h2>
      <p>We process the following categories of personal data:</p>
      <ul>
        <li>
          <strong>Account data</strong> — your email address, your name, and the
          authentication provider you sign in with (for example email or a
          social login). This is what identifies your account.
        </li>
        <li>
          <strong>Portfolio data</strong> — the financial information you enter
          or import: your holdings, their values, mutations (buys, sells,
          deposits, withdrawals), property addresses, and any diary entries or
          notes you write.
        </li>
        <li>
          <strong>Derived snapshots</strong> — values we calculate from your
          portfolio data over time, such as historical net-worth snapshots and
          category breakdowns, so we can show you trends.
        </li>
      </ul>
      <p>
        We do not ask for, and do not want, any data we do not need to run the
        service. We do not knowingly collect special categories of data (such as
        health or biometric data).
      </p>

      <h2>3. Why we process it (legal bases)</h2>
      <p>
        We rely on two legal bases under Article 6 of the GDPR:
      </p>
      <ul>
        <li>
          <strong>Performance of a contract</strong> — we need to process your
          account and portfolio data to provide the service you signed up for:
          storing your portfolio, calculating your figures, and showing them back
          to you.
        </li>
        <li>
          <strong>Consent</strong> — where we send your portfolio context to our
          AI provider to power chat and insights, we do so on the basis of your
          consent, which you give by choosing to use those features. You can stop
          using them at any time.
        </li>
      </ul>

      <h2>4. How AI is used</h2>
      <p>
        Volnar uses AI to help you understand your portfolio. When you ask a
        question or open an insight, the relevant <strong>portfolio context</strong>{" "}
        (such as your holdings and recent changes) is sent to our AI provider,{" "}
        <strong>Anthropic</strong>, so the model can read it and explain it in
        plain language. Data sent to Anthropic through the API is{" "}
        <strong>not used to train their models</strong>.
      </p>
      <p>
        Importantly, the AI does not perform your calculations. All financial
        figures — totals, returns, allocations, FX conversions — are computed by
        deterministic code on our side. The AI only parses and explains; the
        numbers come from the maths, not the model.
      </p>

      <h2>5. Who we share data with (subprocessors)</h2>
      <p>
        We use a small number of trusted providers to run Volnar. Each only
        receives the data it needs for its specific purpose:
      </p>
      <div className="legal-table">
        <dl className="legal-row">
          <dt>Supabase</dt>
          <dd>
            Authentication and database. Stores your account and portfolio data.
            Hosted in the EU.
          </dd>
        </dl>
        <dl className="legal-row">
          <dt>Vercel</dt>
          <dd>
            Application hosting and cookieless, privacy-friendly analytics. No
            personal data is sold or used for advertising.
          </dd>
        </dl>
        <dl className="legal-row">
          <dt>Anthropic</dt>
          <dd>
            AI processing of your portfolio context to power chat and insights.
            Data sent via the Anthropic API is not used to train models.
          </dd>
        </dl>
        <dl className="legal-row">
          <dt>Yahoo Finance</dt>
          <dd>
            Market prices. Queried by ticker symbol only — no personal data is
            sent.
          </dd>
        </dl>
        <dl className="legal-row">
          <dt>frankfurter.app</dt>
          <dd>Foreign-exchange (FX) rates. No personal data is sent.</dd>
        </dl>
        <dl className="legal-row">
          <dt>OpenStreetMap Nominatim</dt>
          <dd>
            Geocoding of property addresses you enter, so we can place them on a
            map.
          </dd>
        </dl>
        <dl className="legal-row">
          <dt>Sentry</dt>
          <dd>
            Error tracking, so we can diagnose and fix crashes and bugs.
          </dd>
        </dl>
      </div>
      <p>
        We do not sell your personal data, and we do not use it for advertising.
      </p>

      <h2>6. Where your data is stored</h2>
      <p>
        Your account and portfolio data are stored in the European Union (the
        Supabase EU region). Where a provider processes data outside the EU, we
        rely on appropriate safeguards such as the European Commission&apos;s
        Standard Contractual Clauses.
      </p>

      <h2>7. How long we keep it</h2>
      <p>
        We keep your data for as long as your account exists. When you delete
        your account, we delete your associated personal and portfolio data.
        Limited records may be retained for a short period where we are legally
        required to, after which they are removed.
      </p>

      <h2>8. Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in (session and
        authentication cookies). Our analytics is cookieless — it does not set
        tracking cookies and does not build an advertising profile of you. We do
        not use third-party advertising or cross-site tracking cookies.
      </p>

      <h2>9. Your rights under the GDPR</h2>
      <p>You have the right to:</p>
      <ul>
        <li>
          <strong>Access</strong> — ask for a copy of the personal data we hold
          about you.
        </li>
        <li>
          <strong>Rectification</strong> — have inaccurate data corrected.
        </li>
        <li>
          <strong>Erasure</strong> — have your data deleted (you can delete your
          account at any time from within Volnar).
        </li>
        <li>
          <strong>Portability</strong> — receive your data in a structured,
          machine-readable format, or have it exported.
        </li>
        <li>
          <strong>Objection</strong> — object to certain processing, and withdraw
          consent for AI features at any time.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email{" "}
        <a href="mailto:support@novahub.nl">support@novahub.nl</a>. You also have the
        right to lodge a complaint with your local data protection authority. In
        the Netherlands this is the{" "}
        <strong>Autoriteit Persoonsgegevens</strong> (Dutch Data Protection
        Authority).
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy as the service evolves. When we make material
        changes, we will update the &ldquo;last updated&rdquo; date above and,
        where appropriate, notify you in the app.
      </p>

      <div className="legal-contact">
        <p>
          <strong>NovaHub B.V.</strong>
          <br />
          KVK 92194923 · Eindhoven, the Netherlands
          <br />
          <a href="mailto:support@novahub.nl">support@novahub.nl</a>
        </p>
        <p style={{ margin: 0 }}>
          See also our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </main>
  );
}
