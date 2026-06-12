import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "Terms of Service — Volnar",
  description:
    "The terms that govern your use of Volnar, a portfolio tracking and intelligence tool operated by NovaHub B.V.",
};

const LAST_UPDATED = "12 June 2026";

export default function TermsPage() {
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

      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

      <p className="legal-intro">
        These terms govern your use of Volnar, operated by{" "}
        <strong>NovaHub B.V.</strong> By creating an account or using Volnar, you
        agree to these terms. If you do not agree, please do not use the service.
      </p>

      <h2>1. What Volnar is</h2>
      <p>
        Volnar is a <strong>portfolio tracking and intelligence tool</strong>. It
        helps you record your holdings, see them in one place, track how they
        change over time, and ask questions about your portfolio in plain
        language.
      </p>
      <p>
        Volnar is provided for <strong>informational purposes only</strong>.
        Nothing in the service is financial, investment, tax, accounting, or
        legal advice, and nothing in it is a recommendation to buy, sell, or hold
        any asset. You are solely responsible for your own financial decisions.
        Consider seeking advice from a qualified professional before acting.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least <strong>18 years old</strong> to use Volnar. By using
        the service you confirm that you are 18 or older and that you are able to
        enter into a binding agreement.
      </p>

      <h2>3. Your account</h2>
      <p>
        You are responsible for keeping your account secure, including your login
        credentials and any device you stay signed in on. You are responsible for
        the activity that happens under your account. Tell us promptly at{" "}
        <a href="mailto:support@volnar.nl">support@volnar.nl</a> if you believe
        your account has been accessed without your permission.
      </p>
      <p>
        You are responsible for the accuracy of the portfolio data you enter.
        Volnar reflects what you put in; it cannot verify that your holdings or
        values are correct.
      </p>

      <h2>4. Acceptable use</h2>
      <p>When using Volnar, you agree not to:</p>
      <ul>
        <li>use the service for any unlawful purpose, or to break any applicable law or regulation;</li>
        <li>attempt to gain unauthorised access to the service, other accounts, or our systems;</li>
        <li>interfere with, disrupt, overload, or probe the service or its infrastructure;</li>
        <li>scrape, copy, or resell the service or its content except as expressly permitted; or</li>
        <li>upload anything that infringes the rights of others or that you do not have the right to share.</li>
      </ul>

      <h2>5. Third-party data</h2>
      <p>
        Volnar shows market prices, foreign-exchange rates, and other information
        sourced from third parties (for example market data and FX providers).
        This data may be delayed, incomplete, or inaccurate. We provide it{" "}
        <strong>&ldquo;as is&rdquo; with no warranty</strong> as to its accuracy,
        timeliness, or fitness for any purpose, and we are not responsible for
        decisions you make based on it.
      </p>

      <h2>6. No warranty</h2>
      <p>
        Volnar is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis. To the fullest extent permitted by law, we make
        no warranties of any kind, whether express or implied, including as to
        merchantability, fitness for a particular purpose, or that the service
        will be uninterrupted, error-free, or secure.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, NovaHub B.V. and its team will not
        be liable for any indirect, incidental, special, consequential, or
        punitive damages, or for any loss of profits, investment losses, or loss
        of data, arising out of or related to your use of Volnar. Nothing in these
        terms excludes or limits liability that cannot be excluded or limited
        under applicable law.
      </p>

      <h2>8. Availability and changes to the service</h2>
      <p>
        We may change, suspend, or discontinue parts of the service, and we may
        update features over time. We will try to give reasonable notice of
        significant changes where we can. You can stop using Volnar and delete
        your account at any time.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. When we make material
        changes, we will update the &ldquo;last updated&rdquo; date above and,
        where appropriate, notify you in the app. Continuing to use Volnar after
        changes take effect means you accept the updated terms.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of <strong>the Netherlands</strong>,
        without regard to its conflict-of-law rules. Any disputes will be subject
        to the competent courts of the Netherlands, unless mandatory consumer law
        gives you the right to bring proceedings elsewhere.
      </p>

      <div className="legal-contact">
        <p>
          <strong>NovaHub B.V.</strong>
          <br />
          KVK 92194923 · Eindhoven, the Netherlands
          <br />
          <a href="mailto:support@volnar.nl">support@volnar.nl</a>
        </p>
        <p style={{ margin: 0 }}>
          See also our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
