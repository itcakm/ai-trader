'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface VirtualScrollOptions {
  /** Total number of items */
  itemCount: number;
  /** Height of each item in pixels */
  itemHeight: number;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Container height (if not provided, will be calculated from ref) */
  containerHeight?: number;
}

export interface VirtualScrollResult {
  /** Index of the first visible item */
  startIndex: number;
  /** Index of the last visible item */
  endIndex: number;
  /** Total height of all items */
  totalHeight: number;
  /** Offset from top for the first rendered item */
  offsetTop: number;
  /** Items to render (indices) */
  virtualItems: VirtualItem[];
  /** Scroll handler to attach to container */
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  /** Ref to attach to the scrollable container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Current scroll position */
  scrollTop: number;
}

export interface VirtualItem {
  /** Index of the item in the original data */
  index: number;
  /** Offset from top in pixels */
  offsetTop: number;
  /** Height of the item */
  height: number;
}

/**
 * Hook for virtual scrolling large lists
 * Only renders items that are visible in the viewport plus overscan
 */
export function useVirtualScroll({
  itemCount,
  itemHeight,
  overscan = 5,
  containerHeight: providedContainerHeight,
}: VirtualScrollOptions): VirtualScrollResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(providedContainerHeight || 400);

  // Update container height on resize
  useEffect(() => {
    if (providedContainerHeight) {
      setContainerHeight(providedContainerHeight);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [providedContainerHeight]);

  // Calculate visible range
  const { startIndex, endIndex, virtualItems, totalHeight, offsetTop } = useMemo(() => {
    const totalHeight = itemCount * itemHeight;

    // Calculate visible range
    const visibleStartIndex = Math.floor(scrollTop / itemHeight);
    const visibleEndIndex = Math.min(
      itemCount - 1,
      Math.floor((scrollTop + containerHeight) / itemHeight)
    );

    // Add overscan
    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(itemCount - 1, visibleEndIndex + overscan);

    // Calculate offset for positioning
    const offsetTop = startIndex * itemHeight;

    // Generate virtual items
    const virtualItems: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      virtualItems.push({
        index: i,
        offsetTop: i * itemHeight,
        height: itemHeight,
      });
    }

    return {
      startIndex,
      endIndex,
      virtualItems,
      totalHeight,
      offsetTop,
    };
  }, [itemCount, itemHeight, scrollTop, containerHeight, overscan]);

  // Scroll handler
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    virtualItems,
    onScroll,
    containerRef,
    scrollTop,
  };
}

/**
 * Hook for virtual scrolling with variable row heights
 * More complex but supports rows of different heights
 */
export interface VariableVirtualScrollOptions {
  /** Total number of items */
  itemCount: number;
  /** Function to get height of each item */
  getItemHeight: (index: number) => number;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Container height */
  containerHeight?: number;
}

export function useVariableVirtualScroll({
  itemCount,
  getItemHeight,
  overscan = 5,
  containerHeight: providedContainerHeight,
}: VariableVirtualScrollOptions): VirtualScrollResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(providedContainerHeight || 400);

  // Update container height on resize
  useEffect(() => {
    if (providedContainerHeight) {
      setContainerHeight(providedContainerHeight);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [providedContainerHeight]);

  // Pre-calculate item positions
  const itemPositions = useMemo(() => {
    const positions: { offset: number; height: number }[] = [];
    let offset = 0;

    for (let i = 0; i < itemCount; i++) {
      const height = getItemHeight(i);
      positions.push({ offset, height });
      offset += height;
    }

    return positions;
  }, [itemCount, getItemHeight]);

  // Calculate total height
  const totalHeight = useMemo(() => {
    if (itemPositions.length === 0) return 0;
    const lastItem = itemPositions[itemPositions.length - 1];
    return lastItem.offset + lastItem.height;
  }, [itemPositions]);

  // Binary search to find start index
  const findStartIndex = useCallback(
    (scrollTop: number) => {
      let low = 0;
      let high = itemPositions.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const item = itemPositions[mid];

        if (item.offset + item.height < scrollTop) {
          low = mid + 1;
        } else if (item.offset > scrollTop) {
          high = mid - 1;
        } else {
          return mid;
        }
      }

      return Math.max(0, low);
    },
    [itemPositions]
  );

  // Calculate visible range
  const { startIndex, endIndex, virtualItems, offsetTop } = useMemo(() => {
    if (itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: -1,
        virtualItems: [],
        offsetTop: 0,
      };
    }

    // Find visible range
    const visibleStartIndex = findStartIndex(scrollTop);
    let visibleEndIndex = visibleStartIndex;

    // Find end index
    let accumulatedHeight = itemPositions[visibleStartIndex]?.offset || 0;
    while (
      visibleEndIndex < itemCount - 1 &&
      accumulatedHeight < scrollTop + containerHeight
    ) {
      visibleEndIndex++;
      accumulatedHeight = itemPositions[visibleEndIndex].offset + itemPositions[visibleEndIndex].height;
    }

    // Add overscan
    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(itemCount - 1, visibleEndIndex + overscan);

    // Calculate offset
    const offsetTop = itemPositions[startIndex]?.offset || 0;

    // Generate virtual items
    const virtualItems: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const pos = itemPositions[i];
      virtualItems.push({
        index: i,
        offsetTop: pos.offset,
        height: pos.height,
      });
    }

    return {
      startIndex,
      endIndex,
      virtualItems,
      offsetTop,
    };
  }, [itemCount, itemPositions, scrollTop, containerHeight, overscan, findStartIndex]);

  // Scroll handler
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    virtualItems,
    onScroll,
    containerRef,
    scrollTop,
  };
}
