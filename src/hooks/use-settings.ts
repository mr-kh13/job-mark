import { useState } from 'react';
import { z } from 'zod';
import { logger } from '@/utils/logger';

export const SETTINGS_STORAGE_KEY = 'jobmark:settings';

const Settings = z.object({ isAiEnabled: z.boolean().default(true) });
export type Settings = z.infer<typeof Settings>;

function load(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return Settings.parse(raw === null ? {} : JSON.parse(raw));
  } catch (error) {
    logger.warn({ err: error }, 'Could not read the saved settings');
    return Settings.parse({});
  }
}

/**
 * The user's settings, remembered across visits. Unreadable or blocked storage falls back to the
 * defaults, and a change that cannot be saved still applies to this visit.
 *
 * @returns The settings and a function that replaces them.
 */
export function useSettings() {
  const [settings, setSettings] = useState(load);

  const update = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      logger.warn({ err: error }, 'Could not save the settings');
    }
  };

  return [settings, update] as const;
}
