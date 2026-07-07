import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import SeatingPlanZoomSurface from '@/components/seating/SeatingPlanZoomSurface';
import { normalizeGuestSeatingPlans, resolveInitialPlanIndex } from '@/lib/seatingPlanUtils';

export default function SeatingPlanViewer({
  open,
  onClose,
  plan = null,
  plans = null,
  initialPlanId = null,
}) {
  const normalizedPlans = useMemo(
    () => (Array.isArray(plans) && plans.length ? plans.filter((p) => p?.imageUrl) : normalizeGuestSeatingPlans(plan)),
    [plan, plans],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselApi, setCarouselApi] = useState(null);

  useEffect(() => {
    if (!open) return;
    const idx = resolveInitialPlanIndex(normalizedPlans, initialPlanId);
    setActiveIndex(idx);
    if (carouselApi) {
      carouselApi.scrollTo(idx, true);
    }
  }, [open, initialPlanId, normalizedPlans, carouselApi]);

  useEffect(() => {
    if (!carouselApi) return undefined;
    const onSelect = () => setActiveIndex(carouselApi.selectedScrollSnap());
    carouselApi.on('select', onSelect);
    onSelect();
    return () => carouselApi.off('select', onSelect);
  }, [carouselApi]);

  if (normalizedPlans.length === 0) return null;

  const activePlan = normalizedPlans[activeIndex] || normalizedPlans[0];
  const hasMultiple = normalizedPlans.length > 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        className="max-w-[min(100vw,960px)] w-full h-[min(100dvh,920px)] p-0 gap-0 border-0 overflow-hidden flex flex-col"
        style={{
          background: 'rgba(8, 8, 10, 0.98)',
          border: '1px solid rgba(192, 192, 192, 0.25)',
          borderRadius: 16,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--sec-border)' }}
        >
          <div className="min-w-0 pr-3">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--sec-text-primary)' }}>
              {activePlan.name || 'Seating plan'}
            </h2>
            {activePlan.caption ? (
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--sec-text-muted)' }}>
                {activePlan.caption}
              </p>
            ) : null}
            {hasMultiple ? (
              <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--sec-accent)' }}>
                {activeIndex + 1} of {normalizedPlans.length} — swipe for more floors
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

        <div className="flex-1 min-h-0 flex flex-col">
          <Carousel
            setApi={setCarouselApi}
            opts={{ align: 'start', loop: false, watchDrag: hasMultiple }}
            className="flex-1 min-h-0 flex flex-col"
          >
            <CarouselContent className="ml-0 h-full flex-1">
              {normalizedPlans.map((item) => (
                <CarouselItem key={item.id || item.imageUrl} className="pl-0 basis-full h-full">
                  <div className="h-[calc(min(100dvh,920px)-140px)] min-h-[280px]">
                    <SeatingPlanZoomSurface
                      imageUrl={item.imageUrl}
                      alt={item.name || 'Venue seating plan'}
                      resetKey={item.id || item.imageUrl}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        {hasMultiple ? (
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-t shrink-0"
            style={{ borderColor: 'var(--sec-border)' }}
          >
            <button
              type="button"
              disabled={activeIndex <= 0}
              onClick={() => carouselApi?.scrollPrev()}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center disabled:opacity-40"
              style={{ background: 'var(--sec-bg-elevated)' }}
              aria-label="Previous plan"
            >
              <ChevronLeft size={20} style={{ color: 'var(--sec-text-primary)' }} />
            </button>
            <div className="flex items-center gap-1.5 flex-1 justify-center">
              {normalizedPlans.map((item, i) => (
                <button
                  key={item.id || i}
                  type="button"
                  onClick={() => carouselApi?.scrollTo(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === activeIndex ? 18 : 8,
                    height: 8,
                    background: i === activeIndex ? 'var(--sec-accent)' : 'var(--sec-border-strong)',
                  }}
                  aria-label={`Go to ${item.name || `plan ${i + 1}`}`}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={activeIndex >= normalizedPlans.length - 1}
              onClick={() => carouselApi?.scrollNext()}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center disabled:opacity-40"
              style={{ background: 'var(--sec-bg-elevated)' }}
              aria-label="Next plan"
            >
              <ChevronRight size={20} style={{ color: 'var(--sec-text-primary)' }} />
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
