import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';

export default function GbvConsequences() {
  return (
    <LegalDocumentPage
      title="GBV & Safety Consequences"
      effectiveDate="Effective April 2026 · Zero-tolerance policy"
    >
      <LegalPolicySection title="1. Zero Tolerance Statement">
        <p>
          SEC maintains a strict zero-tolerance approach to Gender-Based Violence (GBV), sexual harassment, sexual
          assault, coercion, stalking, intimidation, and all forms of gender-targeted abuse on and off platform where
          activity is connected to SEC use.
        </p>
        <p>
          This policy applies to all users, including party goers, hosts, promoters, venue owners, freelancers, and
          staff interacting through SEC features such as profiles, messages, events, tables, and bookings.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Prohibited Conduct">
        <p>Examples of prohibited conduct include:</p>
        <p>
          Unwanted sexual messages, threats, hate speech, non-consensual touching, pressure for sexual favors, sharing
          intimate images without consent, and retaliation against anyone who reports abuse.
        </p>
        <p>
          Any attempt to normalize, justify, or encourage GBV behavior is also treated as a policy violation.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="3. Reporting and Immediate Safety">
        <p>
          If you are in immediate danger, contact emergency services and local law enforcement first. SEC reporting is
          not a substitute for emergency response.
        </p>
        <p>
          Users should report incidents through in-app reporting tools or support channels as soon as possible, with
          evidence where available (messages, screenshots, dates, locations, and witness details).
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="4. Investigation Process">
        <p>
          SEC may investigate reported incidents by reviewing platform logs, communications, profile activity, event and
          booking history, and any submitted evidence.
        </p>
        <p>
          We may request additional information from involved parties and cooperate with lawful requests from competent
          authorities where required.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="5. Enforcement Consequences">
        <p>Violations may result in one or more actions, depending on severity and risk:</p>
        <p>
          Warning notices, feature restrictions, event/table participation blocks, suspension, permanent account bans,
          venue listing removal, promoter verification revocation, and referral to law enforcement.
        </p>
        <p>
          Serious violations can lead to immediate account disabling without prior warning to protect user safety.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="6. Non-Retaliation and Accountability">
        <p>
          Retaliation against reporters, witnesses, or affected users is prohibited. Submitting intentionally false
          reports may also result in enforcement action.
        </p>
        <p>
          All users are expected to uphold a safe nightlife environment rooted in consent, dignity, and respect.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Related Documents">
        <p>
          <Link to={createPageUrl('CommunityGuidelines')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Community Guidelines
          </Link>
          {' · '}
          <Link to={createPageUrl('TermsOfService')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>
          {' · '}
          <Link to={createPageUrl('PromoterCodeOfConduct')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Promoter Code of Conduct
          </Link>
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
