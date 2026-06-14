import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';

export default function AgeVerificationDeclaration() {
  return (
    <LegalDocumentPage
      title="Age Verification Declaration"
      effectiveDate="Effective June 2026 · All SEC Nightlife users"
    >
      <LegalPolicySection title="1. Declaration of Age">
        <p>
          By accepting this declaration, you confirm that you are <strong>18 years of age or older</strong> and
          legally permitted to participate in nightlife activities on the SEC Nightlife platform.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Accuracy of Information">
        <p>
          You declare that your date of birth, gender, and any other profile information you provide are true,
          complete, and not misleading. You accept full responsibility for any false, inaccurate, or incomplete
          information you submit.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="3. Nightlife Conduct & Risk">
        <p>
          You acknowledge that nightlife involves inherent risks, including interactions with other users and
          attendance at venues and events. You agree to behave lawfully and respectfully, and you accept personal
          responsibility for your conduct and decisions when using SEC Nightlife.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="4. Platform Enforcement">
        <p>
          SEC may suspend, restrict, or permanently terminate your account if we reasonably believe you have
          misrepresented your age or identity, violated our policies, or engaged in fraud, abuse, or unlawful
          conduct. SEC may cooperate with venues, law enforcement, or regulators where required by law.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="5. Limitation of Liability">
        <p>
          SEC facilitates connections and transactions but does not control venue operations, third-party conduct,
          or on-site safety. To the fullest extent permitted by law, you agree that SEC is not liable for losses
          arising from your misrepresentation of age or from your use of the platform, subject to our{' '}
          <Link to={createPageUrl('TermsOfService')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>
          .
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="6. Related Policies">
        <p>
          This declaration is accepted together with our{' '}
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
          . Continued use of SEC Nightlife constitutes your ongoing agreement to these terms.
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
