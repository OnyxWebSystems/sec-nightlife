import React, { createContext, useContext } from 'react';

const LegalViewerContext = createContext(null);

/** Lets legal pages close/switch inside a signup overlay instead of routing away. */
export function LegalViewerProvider({ onClose, onOpen, children }) {
  return (
    <LegalViewerContext.Provider value={{ onClose, onOpen }}>
      {children}
    </LegalViewerContext.Provider>
  );
}

export function useLegalViewer() {
  return useContext(LegalViewerContext);
}
