import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';

export default function UserAgreement() {
  return (
    <LegalDocumentPage
      title="User Agreement"
      effectiveDate="Effective April 2026 · All SEC Nightlife users"
    >
      <LegalPolicySection title="1. Purpose">
        <p>
          This Agreement establishes the behavioral, ethical, and operational standards required of all users of the SEC
          Nightlife platform. It applies together with our{' '}
          <Link to={createPageUrl('TermsOfService')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>
          ,{' '}
          <Link to={createPageUrl('CommunityGuidelines')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Community Guidelines
          </Link>
          , and{' '}
          <Link to={createPageUrl('PrivacyPolicy')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Privacy Policy
          </Link>
          .
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Code of Conduct">
        <p>Users must behave lawfully, respectfully, and responsibly in all interactions on and off the platform when those interactions arise from SEC-facilitated connections.</p>
      </LegalPolicySection>

      <LegalPolicySection title="3. Nightlife Responsibility">
        <p>
          Users acknowledge the risks associated with nightlife and accept full responsibility for their actions at venues
          and events. SEC does not control venue operations or on-site safety—see our Terms for limitations of liability.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="4. Platform Integrity">
        <p>
          Users must not engage in fraud, abuse, or manipulation of the Platform—including fake accounts, payment evasion,
          or coordinated harm to other users or SEC systems.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="5. Enforcement">
        <p>
          SEC reserves full enforcement rights, including warnings, feature restrictions, suspensions, and permanent bans,
          for violations of this Agreement or other SEC policies.
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
