import React from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function SeatingPlanViewer({ open, onClose, plan }) {
  if (!plan?.imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        className="max-w-[min(100vw,960px)] w-full p-0 gap-0 border-0 overflow-hidden"
        style={{
          background: 'rgba(8, 8, 10, 0.98)',
          border: '1px solid rgba(192, 192, 192, 0.25)',
          borderRadius: 16,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--sec-border)' }}
        >
          <div className="min-w-0 pr-3">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--sec-text-primary)' }}>
              {plan.name || 'Seating plan'}
            </h2>
            {plan.caption ? (
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--sec-text-muted)' }}>
                {plan.caption}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--sec-bg-elevated)' }}
            aria-label="Close seating plan"
          >
            <X size={18} style={{ color: 'var(--sec-text-primary)' }} />
          </button>
        </div>
        <div
          className="overflow-auto max-h-[calc(100dvh-120px)] p-4"
          style={{ touchAction: 'pinch-zoom' }}
        >
          <img
            src={plan.imageUrl}
            alt={plan.name || 'Venue seating plan'}
            className="w-full h-auto max-h-[75dvh] object-contain mx-auto rounded-lg"
            style={{ touchAction: 'pinch-zoom' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
