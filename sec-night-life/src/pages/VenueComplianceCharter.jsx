import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import LegalPdfPanel from '@/components/legal/LegalPdfPanel';
import { LEGAL_PDF } from '@/legal/documentUrls';

export default function VenueComplianceCharter() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Venue Compliance Charter</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-2xl mx-auto">
        <LegalPdfPanel
          title="Venue Compliance Charter"
          pdfSrc={LEGAL_PDF.venueComplianceCharter}
          intro="Expectations and requirements for venues operating on SEC—including documentation and verification."
          effectiveDate="April 2026"
        />
      </div>
    </div>
  );
}
