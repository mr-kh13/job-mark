# AGENTS.md

Jobmark is a Chrome extension (Manifest V3) that logs the jobs a user saves or applies for on Seek (Australia and New Zealand) and LinkedIn, in a private sheet kept in the browser. This file tells coding agents and contributors how to work in the repo. [README.md](README.md) covers the product and [docs/PRIVACY.md](docs/PRIVACY.md) is the privacy policy.

Stack: WXT, React 19, TypeScript, Tailwind CSS 4, shadcn on Base UI, zod 4, TanStack Form and Table, date-fns, lucide-react, pino, write-excel-file, Vitest 5, pnpm.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm zip` (store zip in `.output/`), `pnpm seed [count]`
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format`

Run this gate after every change, then the format check:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm exec prettier --check .
```

Format after edits with `pnpm format`. It covers Markdown too, so Prettier aligns tables.

Checks after each build (as of 0.1.0; investigate any growth):

- `grep -c "fetch(" .output/chrome-mv3/chunks/*.js .output/chrome-mv3/background.js .output/chrome-mv3/content-scripts/*.js | grep -v ":0$"` lists nothing.
- `grep -lE "zod|pino|date-fns|LanguageModel" .output/chrome-mv3/content-scripts/*.js` lists nothing.
- Content scripts are about 7.5 KB (LinkedIn) and 8 KB (Seek). The package is about 1 MB.
- The manifest asks only for `storage`, `scripting` and `activeTab`, with no `host_permissions` and no `web_accessible_resources` (LinkedIn probes extension ids through web-accessible files). The content scripts match `au.seek.com`, `nz.seek.com` and `www.linkedin.com`.

## Layout

- `src/entrypoints/`: `background/` (service worker: `click-handler.ts`, `message-handler.ts`, `toolbar-mark.ts`), `popup/`, `sheet/`, and the two content-script entries.
- `src/content/`: code that runs inside job pages (click classifier and listener, page job, read-job listener).
- `src/sites/`: everything that depends on a site's markup, one file per site (`seek.ts`, `linkedin.ts`), tested against HTML fixtures in `src/sites/fixtures/`.
- `src/store/`: the `Job` zod schema (`job.ts`), the store (`job-store.ts`, one storage key per job), keys, display text and stats.
- `src/messages/`: zod schemas for messages between contexts (`click`, `page-job`, `read-job`).
- `src/components/` (shared UI; `ui/` is generated shadcn, lint-exempt; `inspiration/` is the daily line), `src/hooks/`, `src/utils/`, `src/test-utils/`, `scripts/seed.ts`.

Flows:

- Apply or Save click: the content script sends `click`, the service worker validates it with zod and `click-handler.ts` writes the store.
- Toolbar dot: the content script sends only the job id from the page address (`page-job`), and `toolbar-mark.ts` sets the tab's icon with `action.setIcon`.
- Popup "Save this job": the popup sends `read-job` to the tab's content script, which reads the job with the same extractors as click capture. `popup/job-draft.ts` builds the form from that, then JSON-LD, then the tab title.

Placement: code with one consumer lives next to it, generic helpers go in `utils/`, site knowledge goes in `sites/`, and each runtime context keeps its code under `entrypoints/<context>/`.

## Code rules

The linter enforces these ([eslint.config.js](eslint.config.js)):

- No spread anywhere in `src`, tests included. Use `over.x ?? default` and `array.concat(...)`.
- No re-exports, no `Object.assign`, no empty `catch`. Use `type`, not `interface`.
- Boolean variables, parameters and type properties start with `is`, `has`, `can`, `should`, `did` or `will`.
- No `console` in `src` (use `@/utils/logger`), except in `src/content/**`.
- Layers: `src/content/**` and `src/sites/**` import only a small allow-list at runtime (`@/store/job-display`, `@/store/job-key`, `@/utils/text`, `@/utils/url`, `@/content/*`, `@/sites/*`), and everything else is type-only. `components`, `store`, `hooks`, `utils` and `messages` cannot import `@/entrypoints/*`. `popup`, `sheet` and `background` cannot import each other.

Conventions the linter cannot check:

- Imports are relative inside a feature folder and `@/` across folders. A list of only types uses `import type`.
- Handlers are `handle*` (`handleSave`) and props are `on*`. Name a value by what it holds or returns, so vague names such as `now` or `data` get flagged. Files in `components/` and `hooks/` are kebab-case.
- The only `useEffect` in app code is in `hooks/use-jobs.ts`.
- Comments are one or two lines, with no narrative or bug history and no unmeasured numbers. A JSDoc summary is at most two lines, then `@param name - description`, `@returns`, `@throws`, with no `{type}`.
- Log with `logger.warn({ err: error }, 'Could not do X')`. For a user-requested action use `reportFailure('do X', error)` or `writeOrReport(promise, 'do X')` (see `src/utils/write-or-report.ts`).
- UI uses the styled components. Show extra information with an info icon and the Base UI tooltip (`components/ui/tooltip.tsx`), never the native `title` attribute.
- Prettier: single quotes, 100 columns.
- Prose (docs, comments, copy): short, plain sentences. State things directly, with no "not X, but Y" contrast and no marketing words.

## Testing

- Write the failing test first. Mutation-check new logic: change one thing, expect failures, restore, and do not edit sources during a run. A survivor needs a test or a reason it is an equivalent mutant. Moves, renames, docs, CSS and assets skip this.
- No testing-library. Helpers are in `src/test-utils/` (`render`, `query`, `select`, `menu`, `user-click` and others). UI tests use jsdom with the `web-locks.ts` setup.
- Store, background and backup tests start with `// @vitest-environment node` and use `fakeBrowser`. It lacks `action.setIcon` and `tabs.sendMessage`, so use `stubTabIcons`, `stubTabReply`, `stubTabs`, `stubInjection` and `stubContexts` from `src/test-utils/browser-stubs.ts`.
- A fake `runtime.onMessage` listener must `return true` for the reply to arrive. Use `userClick` for trusted clicks, `vi.restoreAllMocks()` in `afterEach`, and `// @vitest-environment-options {"url": "..."}` for site-address tests.
- `vitest.config.ts` pins `TZ=UTC`. `xlsx.test.ts` sets its own zone.
- A test reads the dot pixel of each `public/icon/mark-<hex>-<size>.png` and compares it with `STATUS_COLOURS`. If a status colour changes, redraw those icons.

## Fixtures and data hygiene

No real company or person names and no production values from Seek or LinkedIn in fixtures, tests, docs or seed data.

- Companies: Acme, Globex, Initech, Contoso, Fabrikam, Northwind, Wingtip, Tailspin, Litware, Adatum, Proseware, Woodgrove.
- Ids: Seek `10000001` to `10000007`, LinkedIn `1000000001` and `1000000002`. Zero out `sol=` tokens, use `cdn.example.com` for image hosts, and remove `class` attributes from fixtures.
- After capturing a page, read every distinct text and attribute string, scrub them with a script that counts each replacement, then grep the repo for each original name, id and token. It must find nothing.
- No emails, local paths or secrets anywhere. `.env.submit` is for store credentials and must stay out of git.

## Security and privacy

- No network requests. Builds set a strict extension-pages CSP with `connect-src 'none'`, and Vite's module-preload polyfill is off because it contains `fetch()`. Never add `unlimitedStorage`, IndexedDB or a remote font, script or image.
- Every message from a content script is untrusted. The service worker validates it with zod, and the popup validates replies with the `CapturedJob` schema. `import '@/utils/zod-config'` is the first import of the background, popup and sheet entries. The click listener ignores `event.isTrusted === false`.
- `Job` text fields are capped at 1,000 characters, links at 2,048 and ids at 200.
- Nothing is injected into Seek or LinkedIn pages: no badges, toasts or overlays (the sites' terms bar them). The service worker sets the toolbar dot.
- Never click Save or Apply on a real job page to test. It changes the user's account. Use fixtures.
- A change to what the extension stores, reads, requests or declares in the manifest also changes [docs/PRIVACY.md](docs/PRIVACY.md), the README and the store listing's permission justifications and data disclosure.

## Decisions already made

Do not reopen these without asking.

- No xstate, messaging library, react-query, TanStack Virtual or error boundary. The toolbar icon opens the popup. Excel export uses `write-excel-file`. Storage is one key per job.
- No unseen-captures counter, no nagging features and no number on the toolbar icon.
- Daily line: Chrome's on-device Prompt API only, never a model download, no Suspense, one popup row of at most 56 characters, one AI switch (default on) in the sheet's Settings. The prompt holds only whether the week was quiet, active or the best so far.
- Brand: blue `#2563eb` to violet `#7c3aed`, ink `#0f172a`, the system font (no bundled font), the logo lockup in headers. The name and logo are excluded from the MIT licence (see the README).
- Accepted dev-toolchain audit findings (they come in through `wxt` and never ship): no `overrides`. Re-run `pnpm audit` before each store submission.
- Before the first store release there are no migrations or compatibility shims. After it, any `Job` schema change needs a migration, because `jobStore.list()` skips records that no longer validate and would hide users' data. Update this line when 0.1.0 is published.

## Dependencies

- `packageManager` pins pnpm and `.node-version` pins Node. pnpm adds a first YAML document to `pnpm-lock.yaml` for the pinned pnpm, which is expected.
- `pnpm-workspace.yaml` sets `minimumReleaseAge` to 14 days, `trustPolicy: no-downgrade`, `blockExoticSubdeps` and `strictDepBuilds`. Use registry packages only.
- Ask before `pnpm add`, `remove`, `audit`, `view` or `install`, any registry lookup, and the shadcn CLI. They send data out.
- CI actions are pinned by commit SHA in `.github/workflows/ci.yml`.

## Git and releases

- Do not commit, stage or push. The maintainer runs git. End each change with a suggested commit message of two to six words, with no body. The working tree has `autocrlf` on, so CRLF warnings are harmless.
- Push only `main` and version tags, by name. Never `git push --all`.
- Release: bump `version` in `package.json` (the store needs a higher number each upload), run the gate, `pnpm zip`, then tag `v<version>` once CI is green.
- The store summary is the manifest `description` in `wxt.config.ts` (132 characters at most) and must match the dashboard. The long listing text lives in the dashboard. Store images are in `docs/store/` (screenshots 1280x800 24-bit PNG with no alpha, promo tile 440x280).

## Working in a session

- Propose a plan and wait for a go before multi-step work. After a go, do every step and report with numbers.
- A design question gets a yes or no first, then one recommendation. A bug report gets the cause, a plan and a wait. An audit gets findings from real data and one ordered plan.
- Keep replies short and concrete, starting with the result. Report mistakes plainly, including side effects.
- Ask questions in plain text. Once the maintainer overrides a recommendation, follow it.

## Gotchas

- After moving files in `components/`, `utils/` or `hooks/`, run `pnpm exec wxt prepare` before `pnpm typecheck`, or the generated import types point at old paths.
- Editor diagnostics lag. Trust `pnpm typecheck` and `pnpm lint`.
- Chrome injects a `body` font rule into extension pages. `tailwind.css` ends with an unlayered `html body { font-family: var(--font-sans) }` that beats it. Keep it.
- Scripts that need backslashes (regexes, escapes) get mangled when sent through the shell. Write them to a file and run the file. File-writing tools also turn a backslash followed by `u` and four hex digits into the real character, so grep for non-ASCII after writing such text.
- Real-extension checks: load `.output/chrome-mv3` in headless Chrome over `--remote-debugging-pipe` with a fresh `--user-data-dir`. Never launch Chrome without `--user-data-dir`, because it can open the maintainer's everyday browser. Fake Seek and LinkedIn pages by serving fixtures through `Fetch.fulfillRequest`. Do not rebuild while Chrome has the build loaded.
