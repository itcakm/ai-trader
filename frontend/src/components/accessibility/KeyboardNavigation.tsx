'use client';

import React, { useEffect, useCallback, useRef } from 'react';

export type NavigationDirection = 'horizontal' | 'vertical' | 'both' | 'grid';

export interface KeyboardNavigationProps {
  children: React.ReactNode;
  direction?: NavigationDirection;
  loop?: boolean;
  onSelect?: (element: HTMLElement) => void;
  onEscape?: () => void;
  disabled?: boolean;
  columns?: number; // For grid navigation
  role?: string;
  ariaLabel?: string;
}

const NAVIGABLE_SELECTORS = [
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="treeitem"]',
  '[role="gridcell"]',
  '[data-navigable="true"]',
  'button:not([disabled])',
  'a[href]',
].join(', ');

export function KeyboardNavigation({
  children,
  direction = 'vertical',
  loop = true,
  onSelect,
  onEscape,
  disabled = false,
  columns = 1,
  role,
  ariaLabel,
}: KeyboardNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndex = useRef(0);

  const getNavigableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTORS)
    ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'));
  }, []);

  const focusElement = useCallback((index: number) => {
    const elements = getNavigableElements();
    if (elements.length === 0) return;

    let targetIndex = index;
    if (loop) {
      targetIndex = ((index % elements.length) + elements.length) % elements.length;
    } else {
      targetIndex = Math.max(0, Math.min(index, elements.length - 1));
    }

    currentIndex.current = targetIndex;
    elements[targetIndex].focus();
  }, [getNavigableElements, loop]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (disabled) return;

      const elements = getNavigableElements();
      if (elements.length === 0) return;

      const currentElement = document.activeElement as HTMLElement;
      const currentIdx = elements.indexOf(currentElement);
      if (currentIdx === -1) return;

      let handled = false;

      switch (event.key) {
        case 'ArrowDown':
          if (direction === 'vertical' || direction === 'both') {
            focusElement(currentIdx + 1);
            handled = true;
          } else if (direction === 'grid') {
            focusElement(currentIdx + columns);
            handled = true;
          }
          break;

        case 'ArrowUp':
          if (direction === 'vertical' || direction === 'both') {
            focusElement(currentIdx - 1);
            handled = true;
          } else if (direction === 'grid') {
            focusElement(currentIdx - columns);
            handled = true;
          }
          break;

        case 'ArrowRight':
          if (direction === 'horizontal' || direction === 'both' || direction === 'grid') {
            focusElement(currentIdx + 1);
            handled = true;
          }
          break;

        case 'ArrowLeft':
          if (direction === 'horizontal' || direction === 'both' || direction === 'grid') {
            focusElement(currentIdx - 1);
            handled = true;
          }
          break;

        case 'Home':
          focusElement(0);
          handled = true;
          break;

        case 'End':
          focusElement(elements.length - 1);
          handled = true;
          break;

        case 'Enter':
        case ' ':
          if (onSelect && currentElement) {
            onSelect(currentElement);
            handled = true;
          }
          break;

        case 'Escape':
          if (onEscape) {
            onEscape();
            handled = true;
          }
          break;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [disabled, direction, columns, focusElement, getNavigableElements, onSelect, onEscape]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, disabled]);

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      data-keyboard-navigation={direction}
    >
      {children}
    </div>
  );
}
