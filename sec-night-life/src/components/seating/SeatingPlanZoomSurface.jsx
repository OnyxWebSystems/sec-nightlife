import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut } from 'lucide-react';

export default function SeatingPlanZoomSurface({ imageUrl, alt, resetKey }) {
  if (!imageUrl) return null;

  return (
    <TransformWrapper
      key={resetKey}
      initialScale={1}
      minScale={0.5}
      maxScale={6}
      centerOnInit
      doubleClick={{ mode: 'toggle', step: 0.7 }}
      wheel={{ step: 0.12 }}
      pinch={{ step: 5 }}
      panning={{ velocityDisabled: true }}
      limitToBounds={false}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="relative flex flex-col h-full min-h-0">
          <div
            className="flex items-center justify-center gap-2 px-3 py-2 shrink-0"
            style={{ borderBottom: '1px solid var(--sec-border)' }}
          >
            <button
              type="button"
              onClick={() => zoomOut()}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center"
              style={{ background: 'var(--sec-bg-elevated)' }}
              aria-label="Zoom out"
            >
              <ZoomOut size={18} style={{ color: 'var(--sec-text-primary)' }} />
            </button>
            <button
              type="button"
              onClick={() => resetTransform()}
              className="h-11 min-h-[44px] px-4 rounded-full text-xs font-semibold"
              style={{ background: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => zoomIn()}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center"
              style={{ background: 'var(--sec-bg-elevated)' }}
              aria-label="Zoom in"
            >
              <ZoomIn size={18} style={{ color: 'var(--sec-text-primary)' }} />
            </button>
          </div>
          <div
            className="flex-1 min-h-0 overflow-hidden overscroll-contain"
            style={{ touchAction: 'none' }}
          >
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <img
                src={imageUrl}
                alt={alt || 'Venue seating plan'}
                draggable={false}
                className="max-w-none select-none rounded-lg"
                style={{ width: 'auto', height: 'auto', maxHeight: 'min(85dvh, 1200px)' }}
              />
            </TransformComponent>
          </div>
        </div>
      )}
    </TransformWrapper>
  );
}
