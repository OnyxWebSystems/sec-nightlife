import React from 'react';

/**
 * @param {{ audience: 'partygoer' | 'venue', onChange: (a: 'partygoer' | 'venue') => void }} props
 */
export default function HelpRoleTabs({ audience, onChange }) {
  const tabs = [
    { id: 'partygoer', label: 'Party-Goer' },
    { id: 'venue', label: 'Venue' },
  ];

  return (
    <div
      className="relative flex p-1 rounded-2xl"
      role="tablist"
      aria-label="Help audience"
      style={{
        backgroundColor: 'var(--sec-bg-elevated)',
        border: '1px solid var(--sec-border)',
      }}
    >
      {tabs.map((tab) => {
        const active = audience === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className="flex-1 relative z-10 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200"
            style={{
              color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
              backgroundColor: active ? 'var(--sec-bg-card)' : 'transparent',
              boxShadow: active ? '0 0 0 1px rgba(192, 192, 192, 0.18)' : 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
