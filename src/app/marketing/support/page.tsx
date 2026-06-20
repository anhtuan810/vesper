import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "Support — Volnar",
  description:
    "Get help with Volnar, manage your subscription, and request data deletion.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
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

      <h1>Support</h1>

      <p className="legal-intro">
        Need help with Volnar? Email us and a person will reply, usually within
        two business days.
      </p>
      <p>
        <a href="mailto:support@volnar.nl">support@volnar.nl</a>
      </p>

      <h2>Billing and subscriptions</h2>
      <p>
        Your subscription is managed through your Apple ID. To view, change, or
        cancel your plan, open the App Store, tap your account, and select
        Subscriptions. Cancellations take effect at the end of the current
        billing period.
      </p>

      <h2>Your data and privacy</h2>
      <p>
        Volnar stores only what you enter. It does not connect to your bank or
        broker. To request a copy of your data, or to delete your account and all
        associated data, email{" "}
        <a href="mailto:support@volnar.nl">support@volnar.nl</a> from the address
        linked to your account. See the <Link href="/privacy">Privacy Policy</Link>{" "}
        for details.
      </p>

      <h2>Account deletion</h2>
      <p>
        You can request deletion of your account and data at any time by emailing{" "}
        <a href="mailto:support@volnar.nl">support@volnar.nl</a>. Data is removed
        in line with the Privacy Policy and applicable law.
      </p>

      <h2>Links</h2>
      <ul>
        <li>
          <Link href="/privacy">Privacy Policy</Link>
        </li>
        <li>
          <Link href="/terms">Terms of Use</Link>
        </li>
      </ul>

      <div className="legal-contact">
        <p style={{ margin: 0 }}>
          Volnar is operated by <strong>NovaHub B.V.</strong> (Eindhoven,
          Netherlands).
        </p>
      </div>
    </main>
  );
}
