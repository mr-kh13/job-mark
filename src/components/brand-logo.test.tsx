import { afterEach, describe, expect, it } from 'vitest';
import lockup from '@/assets/jobmark-lockup.svg';
import lockupDark from '@/assets/jobmark-lockup-dark.svg';
import { cleanup, render } from '@/test-utils/render';
import { BrandLogo } from './brand-logo';

afterEach(cleanup);

describe('BrandLogo', () => {
  it('names the extension for screen readers', async () => {
    const screen = await render(<BrandLogo />);

    expect(screen.querySelector('img')?.getAttribute('alt')).toBe('Jobmark');
  });

  it('shows the light logo, and the dark logo when the system is set to dark', async () => {
    const screen = await render(<BrandLogo />);

    const darkSource = screen.querySelector('source[media="(prefers-color-scheme: dark)"]');
    expect(lockup).not.toBe(lockupDark);
    expect(screen.querySelector('img')?.getAttribute('src')).toBe(lockup);
    expect(darkSource?.getAttribute('srcset')).toBe(lockupDark);
  });

  it('passes the class name to the image', async () => {
    const screen = await render(<BrandLogo className="h-6 w-auto" />);

    expect(screen.querySelector('img')?.className).toBe('h-6 w-auto');
  });
});
