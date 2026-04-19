import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { LegalPolicySection } from '@/components/legal/LegalPolicySection';

export default function RefundPolicy() {
  return (
    <LegalDocumentPage
      title="Refund Policy"
      effectiveDate="Effective April 2026 · Republic of South Africa"
    >
      <LegalPolicySection title="1. Platform Role and Limitation of Responsibility">
        <p>
          SEC operates strictly as a digital facilitator of transactions between users and venues. SEC does not own,
          control, or manage event operations or financial outcomes and does not issue refunds as a platform operator in
          the ordinary course.
        </p>
        <p>
          All payments made through the Platform are transactions between users and venues (or other counterparties); SEC&apos;s
          role is limited to facilitating these interactions through payment partners.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="2. Venue Responsibility for Refunds">
        <p>
          Venues bear full and exclusive responsibility for handling refund requests, cancellations, and financial
          disputes related to their events and offerings. Users agree that any request for a refund must be directed to
          the venue or event organizer responsible.
        </p>
        <p>
          SEC may provide communication tools to facilitate this process but is not obligated to intervene or enforce
          refund decisions. Venue obligations are also described in our{' '}
          <Link to={createPageUrl('VenueComplianceCharter')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Venue Compliance Charter
          </Link>
          .
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="3. Refund Eligibility and Conditions">
        <p>
          Refund eligibility is determined solely by the venue&apos;s policies and applicable laws. Circumstances under which
          refunds may be considered can include event cancellation, venue closure, or failure to deliver the promised
          service—subject to the venue&apos;s terms.
        </p>
        <p>
          Users acknowledge that refunds will not typically be granted for reasons such as failure to attend, late
          arrival, or violation of venue rules, unless required by law or the venue&apos;s stated policy.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="4. Escrow and Payment Processing">
        <p>
          Where escrow functionality is used, funds may be temporarily held to facilitate transactions. SEC does not
          guarantee the outcome of any financial transaction and assumes no liability for disputes arising from escrow
          arrangements beyond facilitating technical integration with payment providers.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="5. Dispute Handling and Escalation">
        <p>
          Users are required to first contact the venue directly to resolve refund-related issues. If a dispute remains
          unresolved, users may escalate through SEC&apos;s support channels for administrative facilitation.
        </p>
        <p>SEC&apos;s involvement in disputes is limited to facilitation and does not constitute acceptance of liability.</p>
      </LegalPolicySection>

      <LegalPolicySection title="6. Fraud Prevention and Enforcement">
        <p>
          SEC reserves the right to investigate suspected fraudulent activity related to refund claims, including review of
          transaction data, communication logs, and user behavior.
        </p>
        <p>
          Users found to be engaging in fraudulent refund claims may face account suspension or termination, in addition to
          any legal remedies.
        </p>
      </LegalPolicySection>

      <LegalPolicySection title="Related documents">
        <p>
          <Link to={createPageUrl('TermsOfService')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>
          {' · '}
          <Link to={createPageUrl('PrivacyPolicy')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Privacy Policy
          </Link>
        </p>
      </LegalPolicySection>
    </LegalDocumentPage>
  );
}
