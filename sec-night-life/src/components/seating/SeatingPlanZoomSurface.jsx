import React, { useCallback, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const FIT_SCALE = 1;
const SLIDER_MAX_SCALE = 5;
const HARD_MIN_SCALE = 0.4;
const HARD_MAX_SCALE = 10;
const SLIDER_STEP = 1;
const BUTTON_ZOOM_STEP = 0.2;
const SLIDER_PRESETS = [0, 25, 50, 75, 100];

/** Map scale to slider 0–100% (0% = fit, 100% = SLIDER_MAX_SCALE; gestures can exceed both). */
function scaleToSliderPercent(scale) {
  const s = Math.min(HARD_MAX_SCALE, Math.max(HARD_MIN_SCALE, scale));
  if (s <= FIT_SCALE) return 0;
  if (s >= SLIDER_MAX_SCALE) return 100;
  return Math.round(((s - FIT_SCALE) / (SLIDER_MAX_SCALE - FIT_SCALE)) * 100);
}

/** Map slider 0–100% to scale (fit → slider max; gestures can go beyond). */
function sliderPercentToScale(percent) {
  const p = Math.min(100, Math.max(0, percent));
  return FIT_SCALE + (p / 100) * (SLIDER_MAX_SCALE - FIT_SCALE);
}

export default function SeatingPlanZoomSurface({ imageUrl, alt, resetKey }) {
  const [sliderPercent, setSliderPercent] = useState(() => scaleToSliderPercent(FIT_SCALE));

  const handleTransform = useCallback((ref) => {
    setSliderPercent(scaleToSliderPercent(ref.state.scale));
  }, []);

  if (!imageUrl) return null;

  return (
    <TransformWrapper
      key={resetKey}
      initialScale={FIT_SCALE}
      minScale={HARD_MIN_SCALE}
      maxScale={HARD_MAX_SCALE}
      centerOnInit
      smooth
      doubleClick={{ mode: 'toggle', step: 0.35, animationTime: 180 }}
      wheel={{ step: 0.04, smoothStep: 0.002 }}
      pinch={{ disabled: false, step: 5 }}
      panning={{ velocityDisabled: true, disabled: false }}
      limitToBounds={false}
      zoomAnimation={{ animationTime: 120, animationType: 'easeOut' }}
      onTransformed={handleTransform}
      onInit={handleTransform}
    >
      {({ zoomIn, zoomOut, centerView }) => {
        const applySliderPercent = (percent, animationTime = 0) => {
          const next = sliderPercentToScale(percent);
          setSliderPercent(Math.round(percent));
          centerView(next, animationTime);
        };

        return (
          <div className="relative flex flex-col h-full min-h-0">
            <div
              className="shrink-0 px-3 py-2 space-y-2"
              style={{ borderBottom: '1px solid var(--sec-border)' }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => zoomOut(BUTTON_ZOOM_STEP, 120)}
                  className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--sec-bg-elevated)' }}
                  aria-label="Zoom out"
                >
                  <ZoomOut size={18} style={{ color: 'var(--sec-text-primary)' }} />
                </button>

                <div className="flex-1 min-w-0 px-1">
                  <Slider
                    value={[sliderPercent]}
                    min={0}
                    max={100}
                    step={SLIDER_STEP}
                    onValueChange={([value]) => applySliderPercent(value, 0)}
                    aria-label="Zoom level"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => zoomIn(BUTTON_ZOOM_STEP, 120)}
                  className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--sec-bg-elevated)' }}
                  aria-label="Zoom in"
                >
                  <ZoomIn size={18} style={{ color: 'var(--sec-text-primary)' }} />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-semibold tabular-nums min-w-[2.5rem]"
                  style={{ color: 'var(--sec-accent)' }}
                >
                  {sliderPercent}%
                </span>

                <div className="flex flex-wrap gap-1.5 flex-1">
                  {SLIDER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applySliderPercent(preset, 120)}
                      className="h-8 min-h-[32px] px-2.5 rounded-full text-[11px] font-semibold transition-colors"
                      style={{
                        background:
                          sliderPercent === preset
                            ? 'var(--sec-accent-muted)'
                            : 'var(--sec-bg-elevated)',
                        color:
                          sliderPercent === preset
                            ? 'var(--sec-accent)'
                            : 'var(--sec-text-secondary)',
                        border:
                          sliderPercent === preset
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
                    centerView(FIT_SCALE, 120);
                    setSliderPercent(0);
                  }}
                  className="h-8 min-h-[32px] px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                  style={{ background: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
                >
                  <Maximize2 size={12} />
                  Fit
                </button>
              </div>

              <p className="text-[10px] leading-snug" style={{ color: 'var(--sec-text-muted)' }}>
                Scroll, pinch, or use the slider to zoom — drag to pan. Zoom out past 0% or in past 100% anytime.
              </p>
            </div>

            <div
              className="flex-1 min-h-0 overflow-hidden overscroll-contain seating-plan-zoom-canvas"
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
                  className="select-none rounded-lg object-contain"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    touchAction: 'none',
                  }}
                />
              </TransformComponent>
            </div>
          </div>
        );
      }}
    </TransformWrapper>
  );
}
