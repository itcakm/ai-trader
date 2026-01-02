'use client';

import React from 'react';

export interface SkipLink {
  id: string;
  label: string;
  targetId: string;
}

export interface SkipLinksProps {
  links?: SkipLink[];
}

const defaultLinks: SkipLink[] = [
  { id: 'skip-to-main', label: 'Skip to main content', targetId: 'main-content' },
  { id: 'skip-to-nav', label: 'Skip to navigation', targetId: 'main-navigation' },
  { id: 'skip-to-search', label: 'Skip to search', targetId: 'global-search' },
];

export function SkipLinks({ links = defaultLinks }: SkipLinksProps) {
  const handleSkip = (targetId: string) => {
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav
      aria-label="Skip links"
      className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-0 focus-within:left-0 focus-within:z-[9999] focus-within:bg-background focus-within:p-4 focus-within:shadow-lg"
    >
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <a
              id={link.id}
              href={`#${link.targetId}`}
              onClick={(e) => {
                e.preventDefault();
                handleSkip(link.targetId);
              }}
              className="inline-block px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-primary-900 dark:text-primary-200 dark:hover:bg-primary-800"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
