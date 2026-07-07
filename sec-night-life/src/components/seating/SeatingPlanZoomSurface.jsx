import React, { useCallback, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const BUTTON_STEP = 0.12;
const ZOOM_PRESETS = [50, 75, 100, 150, 200, 300, 500];

function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function scaleToSlider(scale) {
  return Math.round(clampScale(scale) * 100);
}

export default function SeatingPlanZoomSurface({ imageUrl, alt, resetKey }) {
  const [scalePercent, setScalePercent] = useState(100);

  const handleTransform = useCallback((ref) => {
    setScalePercent(scaleToSlider(ref.state.scale));
  }, []);

  if (!imageUrl) return null;

  return (
    <TransformWrapper
      key={resetKey}
      initialScale={1}
      minScale={MIN_SCALE}
      maxScale={MAX_SCALE}
      centerOnInit
      smooth
      doubleClick={{ mode: 'toggle', step: 0.35, animationTime: 180 }}
      wheel={{ step: 0.08 }}
      pinch={{ step: 4 }}
      panning={{ velocityDisabled: true }}
      limitToBounds={false}
      zoomAnimation={{ animationTime: 120, animationType: 'easeOut' }}
      onTransformed={handleTransform}
      onInit={handleTransform}
    >
      {({ zoomIn, zoomOut, resetTransform, centerView }) => (
        <div className="relative flex flex-col h-full min-h-0">
          <div
            className="shrink-0 px-3 py-2 space-y-2"
            style={{ borderBottom: '1px solid var(--sec-border)' }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => zoomOut(BUTTON_STEP, 120)}
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--sec-bg-elevated)' }}
                aria-label="Zoom out"
              >
                <ZoomOut size={18} style={{ color: 'var(--sec-text-primary)' }} />
              </button>

              <div className="flex-1 min-w-0 px-1">
                <Slider
                  value={[scalePercent]}
                  min={MIN_SCALE * 100}
                  max={MAX_SCALE * 100}
                  step={5}
                  onValueChange={([value]) => {
                    const next = clampScale(value / 100);
                    setScalePercent(scaleToSlider(next));
                    centerView(next, 0);
                  }}
                  aria-label="Zoom level"
                />
              </div>

              <button
                type="button"
                onClick={() => zoomIn(BUTTON_STEP, 120)}
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--sec-bg-elevated)' }}
                aria-label="Zoom in"
              >
                <ZoomIn size={18} style={{ color: 'var(--sec-text-primary)' }} />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs font-semibold tabular-nums min-w-[3rem]"
                style={{ color: 'var(--sec-accent)' }}
              >
                {scalePercent}%
              </span>

              <div className="flex flex-wrap gap-1.5 flex-1">
                {ZOOM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const next = clampScale(preset / 100);
                      setScalePercent(scaleToSlider(next));
                      centerView(next, 120);
                    }}
                    className="h-8 min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold transition-colors"
                    style={{
                      background:
                        Math.abs(scalePercent - preset) <= 3
                          ? 'var(--sec-accent-muted)'
                          : 'var(--sec-bg-elevated)',
                      color:
                        Math.abs(scalePercent - preset) <= 3
                          ? 'var(--sec-accent)'
                          : 'var(--sec-text-secondary)',
                      border:
                        Math.abs(scalePercent - preset) <= 3
                          ? '1px solid var(--sec-accent-border)'
                          : '1px solid transparent',
                    }}
                  >
                    {preset}%
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  resetTransform(120);
                  setScalePercent(100);
                }}
                className="h-8 min-h-[32px] px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                style={{ background: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
              >
                <Maximize2 size={12} />
                Fit
              </button>
            </div>

            <p className="text-[10px] leading-snug" style={{ color: 'var(--sec-text-muted)' }}>
              Pinch or drag to pan · double-tap to zoom · use the slider for precise zoom
            </p>
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
                style={{ width: 'auto', height: 'auto', maxWidth: 'none' }}
              />
            </TransformComponent>
          </div>
        </div>
      )}
    </TransformWrapper>
  );
}
