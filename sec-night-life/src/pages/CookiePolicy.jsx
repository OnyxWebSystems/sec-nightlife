import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';
import { SUPPORT_EMAIL } from '@/constants/contactEmails';

export default function CookiePolicy() {
  return (
    <LegalDocumentPage
      title="Cookie Policy"
      effectiveDate="Effective April 2026 · SEC Nightlife (&quot;SEC&quot;, &quot;we&quot;, &quot;us&quot;)"
    >
      <LegalPolicySection title="1. Scope">
        <p>
          This Cookie Policy explains how SEC Nightlife uses cookies and similar technologies (including browser
          localStorage and sessionStorage) on our website. It should be read with our{' '}
          <Link to={createPageUrl('PrivacyPolicy')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          Native mobile apps use operating-system permissions (for example notifications and location) rather than
          browser cookies. This policy focuses on the web experience at secnightlife.com.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Strictly necessary storage">
        <p>We use essential storage to operate the service securely:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Authentication tokens so you stay signed in;</li>
          <li>Security and session controls needed to prevent abuse;</li>
          <li>Preferences you set (for example theme or notification UI state);</li>
          <li>Checkout context required to complete a payment you start.</li>
        </ul>
        <p>These are required for the site to function and are not used for advertising.</p>
      </LegalPolicySection>

      <LegalPolicySection title="3. Functional and experience storage">
        <p>Where permitted, we may store:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            An anonymous session id (<code className="text-sm">sec_session_id</code>) to personalize public home feed
            promotions before you sign in;
          </li>
          <li>Age acknowledgement so we do not repeatedly ask guests to confirm they are 18+;</li>
          <li>Cookie notice acknowledgement so we do not show the banner on every visit.</li>
        </ul>
      </LegalPolicySection>

      <LegalPolicySection title="4. Third parties">
        <p>Depending on features you use, third parties may set or receive data via scripts or network requests:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Paystack — payment checkout;</li>
          <li>Google Fonts — typography;</li>
          <li>Google Maps — maps and address tools when you open those features;</li>
          <li>Sentry (if enabled) — error monitoring; may include limited session context on errors.</li>
        </ul>
      </LegalPolicySection>

      <LegalPolicySection title="5. Your choices">
        <p>
          You can clear site data in your browser settings at any time. Blocking strictly necessary storage may prevent
          login or payments from working. For privacy questions, contact {SUPPORT_EMAIL}.
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
