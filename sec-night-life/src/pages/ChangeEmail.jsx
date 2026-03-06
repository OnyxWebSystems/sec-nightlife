import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

export default function ChangeEmail() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
      >
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Change Email</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto">
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
            <div>
              <h2 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                Email change coming soon
              </h2>
              <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                To change your email address, please contact our support team at support@secnightlife.com. We will assist you with the process.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            style={{ borderColor: 'var(--sec-border)' }}
          >
            Back to Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
