'use client';

import React from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { Button } from '@/components/ui';
import type { Theme } from '@/types/theme';

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: '☀️ Light' },
  { value: 'dark', label: '🌙 Dark' },
  { value: 'system', label: '💻 System' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      {themeOptions.map((option) => (
        <Button
          key={option.value}
          variant={theme === option.value ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setTheme(option.value)}
          aria-pressed={theme === option.value}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
