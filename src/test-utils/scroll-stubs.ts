import { vi } from 'vitest';

/** jsdom has no layout, so it lacks `scrollIntoView` and `animate`. These record the calls. */
export const stubScrollAndAnimate = () => {
  const scrollIntoView = vi.fn();
  const animate = vi.fn();
  Reflect.set(Element.prototype, 'scrollIntoView', scrollIntoView);
  Reflect.set(Element.prototype, 'animate', animate);
  return { scrollIntoView, animate };
};

/** The element a recorded call was made on, such as the row that was scrolled into view. */
export const calledOn = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  mock.mock.contexts[call] as HTMLElement;
