'use client';

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

export interface FocusManagerContextValue {
  focusElement: (elementId: string) => void;
  focusFirst: (containerId: string) => void;
  focusLast: (containerId: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;
  registerFocusable: (id: string, element: HTMLElement) => void;
  unregisterFocusable: (id: string) => void;
  announceLive: (message: string, priority?: 'polite' | 'assertive') => void;
}

const FocusManagerContext = createContext<FocusManagerContextValue | null>(null);

export function useFocusManager() {
  const context = useContext(FocusManagerContext);
  if (!context) {
    throw new Error('useFocusManager must be used within a FocusManagerProvider');
  }
  return context;
}

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface FocusManagerProviderProps {
  children: React.ReactNode;
}

export function FocusManagerProvider({ children }: FocusManagerProviderProps) {
  const focusableElements = useRef<Map<string, HTMLElement>>(new Map());
  const [liveMessage, setLiveMessage] = useState<{ message: string; priority: 'polite' | 'assertive' } | null>(null);

  const focusElement = useCallback((elementId: string) => {
    const element = focusableElements.current.get(elementId) || document.getElementById(elementId);
    if (element) {
      element.focus();
    }
  }, []);

  const getFocusableInContainer = useCallback((containerId: string): HTMLElement[] => {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
      .filter((el) => el.offsetParent !== null);
  }, []);

  const focusFirst = useCallback((containerId: string) => {
    const elements = getFocusableInContainer(containerId);
    if (elements.length > 0) {
      elements[0].focus();
    }
  }, [getFocusableInContainer]);

  const focusLast = useCallback((containerId: string) => {
    const elements = getFocusableInContainer(containerId);
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }, [getFocusableInContainer]);

  const getAllFocusable = useCallback((): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
      .filter((el) => el.offsetParent !== null);
  }, []);

  const focusNext = useCallback(() => {
    const elements = getAllFocusable();
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    if (currentIndex >= 0 && currentIndex < elements.length - 1) {
      elements[currentIndex + 1].focus();
    } else if (elements.length > 0) {
      elements[0].focus();
    }
  }, [getAllFocusable]);

  const focusPrevious = useCallback(() => {
    const elements = getAllFocusable();
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    if (currentIndex > 0) {
      elements[currentIndex - 1].focus();
    } else if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }, [getAllFocusable]);

  const registerFocusable = useCallback((id: string, element: HTMLElement) => {
    focusableElements.current.set(id, element);
  }, []);

  const unregisterFocusable = useCallback((id: string) => {
    focusableElements.current.delete(id);
  }, []);

  const announceLive = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setLiveMessage({ message, priority });
    setTimeout(() => setLiveMessage(null), 1000);
  }, []);

  const value: FocusManagerContextValue = {
    focusElement,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    registerFocusable,
    unregisterFocusable,
    announceLive,
  };

  return (
    <FocusManagerContext.Provider value={value}>
      {children}
      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live={liveMessage?.priority || 'polite'}
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage?.message}
      </div>
    </FocusManagerContext.Provider>
  );
}
