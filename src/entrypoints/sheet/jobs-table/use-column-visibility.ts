import { useState } from 'react';
import type { ColumnVisibilityState } from '@tanstack/react-table';
import { z } from 'zod';
import { logger } from '@/utils/logger';

export const COLUMNS_STORAGE_KEY = 'jobmark:sheet-columns';

const Stored = z.record(z.string(), z.boolean());

function load(): ColumnVisibilityState {
  try {
    return Stored.parse(JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? '{}'));
  } catch (error) {
    logger.warn({ err: error }, 'Could not read the saved columns');
    return {};
  }
}

/**
 * Which columns are hidden, remembered across visits. Unreadable or blocked storage falls
 * back to every column visible, and a choice that cannot be saved still applies to this visit.
 *
 * @returns The visibility (a column set to `false` is hidden) and a function that replaces it.
 */
export function useColumnVisibility() {
  const [visibility, setVisibility] = useState(load);

  const update = (next: ColumnVisibilityState) => {
    setVisibility(next);
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      logger.warn({ err: error }, 'Could not save the column choice');
    }
  };

  return [visibility, update] as const;
}
