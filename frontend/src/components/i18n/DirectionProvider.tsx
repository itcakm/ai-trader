'use client';

import React, { createContext, useContext } from 'react';
import type { TextDirection } from '@/types/i18n';
import { useI18n } from '@/providers/I18nProvider';

interface DirectionContextValue {
  direction: TextDirection;
  isRTL: boolean;
}

const DirectionContext = createContext<DirectionContextValue | undefined>(undefined);

export interface DirectionProviderProps {
  children: React.ReactNode;
  /** Override direction (useful for testing or specific sections) */
  forceDirection?: TextDirection;
}

/**
 * Provider for text direction context
 * Automatically uses direction from I18nProvider unless overridden
 */
export function DirectionProvider({ children, forceDirection }: DirectionProviderProps) {
  const { direction: i18nDirection } = useI18n();
  const direction = forceDirection || i18nDirection;
  const isRTL = direction === 'rtl';

  return (
    <DirectionContext.Provider value={{ direction, isRTL }}>
      <div dir={direction} className={isRTL ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </DirectionContext.Provider>
  );
}

/**
 * Hook to access direction context
 */
export function useDirection(): DirectionContextValue {
  const context = useContext(DirectionContext);
  
  // Fallback to I18n context if DirectionProvider not used
  if (context === undefined) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { direction } = useI18n();
    return { direction, isRTL: direction === 'rtl' };
  }
  
  return context;
}
