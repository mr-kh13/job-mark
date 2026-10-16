// jsdom has no Web Locks API. This stand-in runs requests one at a time, which is all the store
// asks of a lock.
if (!Reflect.has(navigator, 'locks')) {
  let last: Promise<unknown> = Promise.resolve();
  const locks = {
    request: (_name: string, task: () => Promise<unknown>) => {
      const run = last.then(task);
      last = Promise.allSettled([run]);
      return run;
    },
  };
  Object.defineProperty(navigator, 'locks', { value: locks });
}
