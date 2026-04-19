import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';

export default function CommunityGuidelines() {
  return (
    <LegalDocumentPage
      title="Community Guidelines"
      effectiveDate="Effective April 2026 · All users and stakeholders"
    >
      <LegalPolicySection title="Purpose and Application">
        <p>
          The SEC Community Guidelines establish the foundational behavioral standards required of all users and
          stakeholders on the Platform. These guidelines are intended to create a safe, respectful, and trustworthy
          environment that supports both social interaction and commercial activity within the nightlife ecosystem.
        </p>
        <p>
          The Guidelines apply universally to all interactions conducted through SEC, including digital communications
          such as messaging and profile content, as well as real-world conduct at events, venues, and engagements
          facilitated by the Platform.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Respectful Conduct and Non-Discrimination">
        <p>
          All users are expected to interact with others in a manner that is respectful, lawful, and free from harassment or
          discrimination. SEC strictly prohibits conduct that targets individuals or groups based on race, gender, sexual
          orientation, religion, nationality, or any other protected characteristic.
        </p>
        <p>
          Any form of abusive language, threats, intimidation, or harassment is considered a violation of these Guidelines
          and may result in immediate enforcement action, including account suspension or permanent removal from the
          Platform.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Safety in Nightlife Environments">
        <p>
          Given the nature of nightlife activities, users are expected to conduct themselves responsibly, particularly in
          environments involving alcohol consumption. Users must respect venue staff, security personnel, and other
          patrons, and must comply with all venue rules and legal requirements.
        </p>
        <p>
          SEC does not tolerate violent, disruptive, or unsafe behavior. Any conduct that endangers others or undermines
          the safety of the environment may result in immediate removal from the Platform.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Fraud, Misrepresentation, and Platform Abuse">
        <p>
          SEC enforces a strict zero-tolerance policy toward fraud and misrepresentation. Users must not create fake
          accounts, submit false identification, misrepresent events, or engage in deceptive practices.
        </p>
        <p>
          Any attempt to manipulate the Platform, including bypassing payment systems, exploiting features, or engaging in
          coordinated abuse, will result in enforcement action.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Enforcement and Moderation">
        <p>
          SEC reserves full discretion to monitor, review, and enforce compliance with these Guidelines. Enforcement
          actions may include content removal, feature restrictions, temporary suspensions, or permanent account
          termination.
        </p>
        <p>
          SEC is not obligated to provide prior notice before taking enforcement action where necessary to protect the
          Platform and its users.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Related documents">
        <p>
          <Link to={createPageUrl('UserAgreement')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            User Agreement
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
