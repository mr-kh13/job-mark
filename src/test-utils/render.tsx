import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React's name for "this is a test, so wait for effects in act()".
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const mounted: { root: Root; container: HTMLElement }[] = [];

/** Renders a React element into the document and waits for effects to settle. */
export async function render(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

/** Runs async work that changes what is on screen, such as a storage write. */
export async function settle(work: () => Promise<unknown> | unknown): Promise<void> {
  await act(async () => {
    await work();
  });
}

/** Unmounts everything `render` mounted. Call it in `afterEach`. */
export async function cleanup(): Promise<void> {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}
