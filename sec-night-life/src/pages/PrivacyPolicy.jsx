import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';
import { SUPPORT_EMAIL, ADMIN_EMAIL } from '@/constants/contactEmails';

export default function PrivacyPolicy() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      effectiveDate="Effective April 2026 · SEC Nightlife (&quot;SEC&quot;, &quot;we&quot;, &quot;us&quot;)"
    >
      <LegalPolicySection title="1. Scope">
        <p>
          This Privacy Policy describes how we collect, use, store, and share personal information when you use the SEC
          Nightlife website and mobile experiences, including accounts, profiles, messaging, bookings, tables, events,
          venue tools, and payments processed through our payment partners.
        </p>
        <p>
          It should be read together with our{' '}
          <Link to={createPageUrl('TermsOfService')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>
          ,{' '}
          <Link to={createPageUrl('UserAgreement')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            User Agreement
          </Link>
          , and (where applicable){' '}
          <Link to={createPageUrl('RefundPolicy')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Refund Policy
          </Link>
          .
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Information we collect">
        <p>
          <strong className="text-[var(--sec-text-primary)]">You provide:</strong> name, email, username, password,
          profile details, photos, preferences, messages you send, support requests, and content you upload (for example
          CVs or documents where a feature asks for them).
        </p>
        <p>
          <strong className="text-[var(--sec-text-primary)]">Automatically:</strong> device and log data (such as IP
          address, browser type, app version), approximate location if you enable location features, usage events needed
          to operate and secure the service, and cookies or similar technologies where permitted.
        </p>
        <p>
          <strong className="text-[var(--sec-text-primary)]">Payments:</strong> payments are handled by our payment
          processor (for example Paystack). We receive limited payment metadata (such as status and transaction
          references), not your full card number.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="3. How we use information">
        <p>We use personal information to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide, maintain, and improve SEC Nightlife;</li>
          <li>Authenticate accounts, prevent fraud and abuse, and enforce our policies;</li>
          <li>Show relevant venues, events, tables, and promotions;</li>
          <li>Send service-related notices (you can manage marketing preferences where applicable);</li>
          <li>Comply with law and respond to lawful requests.</li>
        </ul>
      </LegalPolicySection>

      <LegalPolicySection title="4. Legal bases (where applicable)">
        <p>
          Depending on your region, we rely on appropriate legal bases such as performance of a contract, legitimate
          interests (for example security and analytics that do not override your rights), consent where required, and
          compliance with legal obligations.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="5. Sharing">
        <p>We do not sell your personal information. We may share information with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Service providers who help us host, analyze, email, or secure the platform, under confidentiality obligations;</li>
          <li>Payment processors to complete transactions you initiate;</li>
          <li>Venues and other users where you choose to interact or book (for example showing your name to a table host);</li>
          <li>Law enforcement or regulators when required by law or to protect safety and integrity.</li>
        </ul>
      </LegalPolicySection>

      <LegalPolicySection title="6. Retention">
        <p>
          We keep information only as long as needed for the purposes above, including legal, accounting, and dispute
          resolution. Some data may persist in backups for a limited period. When you delete your account, we delete or
          anonymize personal data from active systems within a reasonable time, except where retention is required by law.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="7. Security">
        <p>
          We use administrative, technical, and organizational measures designed to protect personal information. No
          online service is completely secure; please use a strong password and protect your credentials.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="8. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct, delete, or export your information, or to
          object to or restrict certain processing. Contact us to exercise these rights. You may also lodge a complaint
          with a supervisory authority where applicable.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="9. Children">
        <p>
          SEC Nightlife is intended for adults. We do not knowingly collect personal information from children under the
          minimum age required in your jurisdiction.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="10. International transfers">
        <p>
          If you use SEC from outside the country where our servers or providers operate, your information may be
          processed in countries with different data protection laws. We take steps designed to ensure appropriate
          safeguards where required.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="11. Changes">
        <p>
          We may update this Privacy Policy from time to time. We will post the updated version in the app and adjust the
          effective date. Continued use after changes means you accept the updated policy, to the extent permitted by law.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="12. Contact">
        <p>
          Questions about privacy and legal matters:{' '}
          <a href={`mailto:${ADMIN_EMAIL}`} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            {ADMIN_EMAIL}
          </a>
          . General support:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
