import { useEffect } from 'react';
import { render } from './render';

/**
 * Renders a hook inside a throwaway component.
 *
 * @param useHook - Calls the hook under test and returns what the test reads.
 * @returns An object whose `current` is what the latest render returned.
 */
export async function renderHook<T>(useHook: () => T) {
  const result = { current: undefined as T };
  function Probe() {
    const value = useHook();
    useEffect(() => {
      result.current = value;
    });
    return null;
  }
  await render(<Probe />);
  return result;
}
