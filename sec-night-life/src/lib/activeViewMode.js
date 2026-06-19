/** Persist party-goer vs business viewing mode (localStorage + Layout listener). */
export function setActiveViewMode(mode) {
  if (mode !== 'partygoer' && mode !== 'business') return;
  try {
    localStorage.setItem('sec_active_mode', mode);
    window.dispatchEvent(new CustomEvent('sec_active_mode_changed', { detail: { mode } }));
  } catch {
    /* ignore */
  }
}

export function enterPartygoerMode() {
  setActiveViewMode('partygoer');
}
