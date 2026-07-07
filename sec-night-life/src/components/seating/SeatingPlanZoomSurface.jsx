import React, { useCallback, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const SLIDER_STEP = 1;
const BUTTON_STEP_PERCENT = 5;
const SLIDER_PRESETS = [0, 25, 50, 75, 100];

function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Map pinch/button scale (0.5–10×) to slider position 0–100%. */
function scaleToSliderPercent(scale) {
  const s = clampScale(scale);
  return Math.round(((s - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100);
}

/** Map slider 0–100% to pinch scale. */
function sliderPercentToScale(percent) {
  const p = Math.min(100, Math.max(0, percent));
  return MIN_SCALE + (p / 100) * (MAX_SCALE - MIN_SCALE);
}

export default function SeatingPlanZoomSurface({ imageUrl, alt, resetKey }) {
  const [sliderPercent, setSliderPercent] = useState(() => scaleToSliderPercent(1));

  const handleTransform = useCallback((ref) => {
    setSliderPercent(scaleToSliderPercent(ref.state.scale));
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
      pinch={{ disabled: false, step: 5 }}
      panning={{ velocityDisabled: true, disabled: false }}
      limitToBounds={false}
      zoomAnimation={{ animationTime: 120, animationType: 'easeOut' }}
      onTransformed={handleTransform}
      onInit={handleTransform}
    >
      {({ zoomIn, zoomOut, resetTransform, centerView }) => {
        const applySliderPercent = (percent, animationTime = 0) => {
          const next = sliderPercentToScale(percent);
          setSliderPercent(Math.round(percent));
          centerView(next, animationTime);
        };

        const nudgeSlider = (delta) => {
          applySliderPercent(
            Math.min(100, Math.max(0, sliderPercent + delta)),
            120,
          );
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
                  onClick={() => nudgeSlider(-BUTTON_STEP_PERCENT)}
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
                  onClick={() => nudgeSlider(BUTTON_STEP_PERCENT)}
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
                    resetTransform(120);
                    setSliderPercent(scaleToSliderPercent(1));
                  }}
                  className="h-8 min-h-[32px] px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                  style={{ background: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
                >
                  <Maximize2 size={12} />
                  Fit
                </button>
              </div>

              <p className="text-[10px] leading-snug" style={{ color: 'var(--sec-text-muted)' }}>
                Pinch with two fingers to zoom · drag to pan · slider sets zoom from 0% (wide) to 100% (close)
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
                  className="max-w-none select-none rounded-lg"
                  style={{ width: 'auto', height: 'auto', maxWidth: 'none', touchAction: 'none' }}
                />
              </TransformComponent>
            </div>
          </div>
        );
      }}
    </TransformWrapper>
  );
}
