import React from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/**
 * Responsive onboarding step indicator.
 * Mobile: compact progress bars + current step label.
 * Desktop: labeled pills with connectors.
 */
export default function OnboardingStepIndicator({ steps, currentStep, completedThrough }) {
  const isDesktop = useIsDesktop();
  const activeStep = completedThrough ?? currentStep;
  const current = steps.find((s) => s.number === currentStep) ?? steps[0];

  if (!isDesktop) {
    return (
      <div className="mb-6 px-4 w-full max-w-md mx-auto">
        <div className="flex items-center gap-1.5 mb-2">
          {steps.map((s) => (
            <div
              key={s.number}
              className="flex-1 h-1 rounded-full"
              style={{
                backgroundColor:
                  s.number <= activeStep ? 'var(--sec-accent)' : 'var(--sec-border)',
                transition: 'background-color 0.3s ease',
              }}
            />
          ))}
        </div>
        <p
          className="text-center text-sm font-medium"
          style={{ color: 'var(--sec-text-primary)' }}
        >
          Step {currentStep} of {steps.length}: {current?.title}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 mb-8 px-4 flex-wrap">
      {steps.map((s, index) => (
        <React.Fragment key={s.number}>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              backgroundColor:
                s.number <= activeStep ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
              border: `1px solid ${s.number <= activeStep ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
            }}
          >
            <s.icon
              className="w-4 h-4"
              style={{
                color: s.number <= activeStep ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
              }}
            />
            <span
              className="text-sm font-medium"
              style={{
                color: s.number <= activeStep ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
              }}
            >
              {s.title}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className="w-8 h-0.5"
              style={{
                backgroundColor: s.number < activeStep ? 'var(--sec-accent)' : 'var(--sec-border)',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
