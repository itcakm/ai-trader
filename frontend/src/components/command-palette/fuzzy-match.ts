/**
 * Fuzzy matching utilities for Command Palette search
 * Implements fuzzy search with match highlighting
 */

import type { SearchResult, FuzzyMatchResult, MatchSegment } from './types';

/**
 * Calculate fuzzy match score between query and text
 * Returns score (0-1) and match positions
 */
export function fuzzyMatch(
  query: string,
  text: string
): { score: number; positions: number[] } | null {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  if (queryLower.length === 0) {
    return { score: 1, positions: [] };
  }

  if (queryLower.length > textLower.length) {
    return null;
  }

  const positions: number[] = [];
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let totalConsecutive = 0;
  let lastMatchIndex = -2;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      positions.push(i);

      // Track consecutive matches
      if (i === lastMatchIndex + 1) {
        consecutiveMatches++;
        totalConsecutive += consecutiveMatches;
      } else {
        consecutiveMatches = 1;
      }

      lastMatchIndex = i;
      queryIndex++;
    }
  }

  // All query characters must be found
  if (queryIndex !== queryLower.length) {
    return null;
  }

  // Calculate score based on:
  // 1. Match ratio (how much of the text is matched)
  // 2. Consecutive matches (bonus for sequential characters)
  // 3. Position bonus (matches at start are better)
  const matchRatio = positions.length / textLower.length;
  const consecutiveBonus = totalConsecutive / positions.length;
  const positionBonus = positions[0] === 0 ? 0.2 : 0;
  const wordBoundaryBonus = positions.some(
    (pos) => pos === 0 || textLower[pos - 1] === ' ' || textLower[pos - 1] === '-'
  )
    ? 0.1
    : 0;

  const score = Math.min(
    1,
    matchRatio * 0.4 + consecutiveBonus * 0.3 + positionBonus + wordBoundaryBonus
  );

  return { score, positions };
}

/**
 * Create highlighted segments from match positions
 */
export function createMatchSegments(text: string, positions: number[]): MatchSegment[] {
  if (positions.length === 0) {
    return [{ text, isMatch: false }];
  }

  const segments: MatchSegment[] = [];
  let currentIndex = 0;
  const positionSet = new Set(positions);

  for (let i = 0; i < text.length; i++) {
    const isMatch = positionSet.has(i);
    const lastSegment = segments[segments.length - 1];

    if (lastSegment && lastSegment.isMatch === isMatch) {
      lastSegment.text += text[i];
    } else {
      segments.push({ text: text[i], isMatch });
    }
    currentIndex = i + 1;
  }

  return segments;
}

/**
 * Search and rank results using fuzzy matching
 */
export function fuzzySearch(
  query: string,
  items: SearchResult[]
): FuzzyMatchResult[] {
  if (!query.trim()) {
    return items.map((item) => ({
      item,
      score: 1,
      matches: [{ text: item.title, isMatch: false }],
    }));
  }

  const results: FuzzyMatchResult[] = [];

  for (const item of items) {
    // Match against title
    const titleMatch = fuzzyMatch(query, item.title);

    // Match against description if available
    const descMatch = item.description ? fuzzyMatch(query, item.description) : null;

    // Match against keywords if available
    let keywordMatch: { score: number; positions: number[] } | null = null;
    if (item.keywords) {
      for (const keyword of item.keywords) {
        const match = fuzzyMatch(query, keyword);
        if (match && (!keywordMatch || match.score > keywordMatch.score)) {
          keywordMatch = match;
        }
      }
    }

    // Use best match
    const bestMatch = [titleMatch, descMatch, keywordMatch]
      .filter((m): m is { score: number; positions: number[] } => m !== null)
      .sort((a, b) => b.score - a.score)[0];

    if (bestMatch) {
      // Create segments from title match (for display)
      const titleSegments = titleMatch
        ? createMatchSegments(item.title, titleMatch.positions)
        : [{ text: item.title, isMatch: false }];

      results.push({
        item,
        score: bestMatch.score,
        matches: titleSegments,
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Highlight matched text in a string
 */
export function highlightMatches(segments: MatchSegment[]): string {
  return segments
    .map((seg) => (seg.isMatch ? `<mark>${seg.text}</mark>` : seg.text))
    .join('');
}
