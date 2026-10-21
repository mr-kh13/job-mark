# AGENTS.md

Jobmark is a Chrome extension (Manifest V3) that logs the jobs a user saves or applies for on Seek (Australia and New Zealand) and LinkedIn, in a private sheet kept in the browser. This file tells coding agents and contributors how to work in the repo. [README.md](README.md) covers the product and [docs/PRIVACY.md](docs/PRIVACY.md) is the privacy policy.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm zip` (store zip in `.output/`), `pnpm seed [count]`

Run this gate after every change, then the format check:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm exec prettier --check .
```

Format after edits with `pnpm format`. It covers Markdown too, so Prettier aligns tables.

Checks after each build:

- `grep -c "fetch(" .output/chrome-mv3/chunks/*.js .output/chrome-mv3/background.js .output/chrome-mv3/content-scripts/*.js | grep -v ":0$"` lists nothing.
- `grep -lE "zod|date-fns|LanguageModel" .output/chrome-mv3/content-scripts/*.js` lists nothing.
- Compare content script and package sizes with the last build. Investigate any growth.
- The manifest asks only for `storage`, `scripting` and `activeTab`, with no `host_permissions` and no `web_accessible_resources` (LinkedIn probes extension ids through web-accessible files).

## Layout

- `src/entrypoints/`: `background/` (service worker), `popup/`, `sheet/`, and the two content-script entries.
- `src/content/`: code that runs inside job pages.
- `src/sites/`: everything that depends on a site's markup, one file per site, tested against HTML fixtures in `src/sites/fixtures/`.
- `src/store/`: the `Job` zod schema, the job store (one storage key per job), keys, display text and stats.
- `src/messages/`: zod schemas for messages between contexts.
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
- Content scripts stay small. `src/content/**` and `src/sites/**` have no runtime imports of zod, date-fns, React, hooks, components, messages, or the `Job` schema and store. Type imports are fine.
- `components`, `store`, `hooks`, `utils` and `messages` cannot import `@/entrypoints/*`. `popup`, `sheet` and `background` cannot import each other.

Conventions the linter cannot check:

- Imports are relative inside a feature folder and `@/` across folders. A list of only types uses `import type`.
- Handlers are `handle*` (`handleSave`) and props are `on*`. Name a value by what it holds or returns, so vague names such as `now` or `data` get flagged. Files in `components/` and `hooks/` are kebab-case.
- The only `useEffect` in app code is in `hooks/use-jobs.ts`.
- Comments are one or two lines, with no narrative or bug history and no unmeasured numbers. A JSDoc summary is at most two lines, then `@param name - description`, `@returns`, `@throws`, with no `{type}`.
- Log with `console.warn('Could not do X', error)`. For a user-requested action use `reportFailure('do X', error)` or `writeOrReport(promise, 'do X')` (see `src/utils/write-or-report.ts`).
- UI uses the styled components. Show extra information with an info icon and the Base UI tooltip (`components/ui/tooltip.tsx`), never the native `title` attribute.
- Prettier: single quotes, 100 columns.
- Prose (docs, comments, copy): short, plain sentences. State things directly, with no "not X, but Y" contrast and no marketing words.

## Testing

- Write the failing test first. Mutation-check new logic: change one thing, expect failures, restore, and do not edit sources during a run. A survivor needs a test or a reason it is an equivalent mutant. Moves, renames, docs, CSS and assets skip this.
- No testing-library. Helpers are in `src/test-utils/`. UI tests use jsdom with the `web-locks.ts` setup.
- Store, background and backup tests start with `// @vitest-environment node` and use `fakeBrowser`. It lacks `action.setIcon` and `tabs.sendMessage`, so use the stubs in `src/test-utils/browser-stubs.ts`.
- A fake `runtime.onMessage` listener must `return true` for the reply to arrive. Use `userClick` for trusted clicks, `vi.restoreAllMocks()` in `afterEach`, and `// @vitest-environment-options {"url": "..."}` for site-address tests.
- `vitest.config.ts` pins `TZ=UTC`. A test that needs another zone sets it itself.
- A test reads the dot pixel of each `public/icon/mark-<hex>-<size>.png` and compares it with `STATUS_COLOURS`. If a status colour changes, redraw those icons.

## Fixtures and data hygiene

No real company or person names and no production values from Seek or LinkedIn in fixtures, tests, docs or seed data.

- Companies: Acme, Globex, Initech, Contoso, Fabrikam, Northwind, Wingtip, Tailspin, Litware, Adatum, Proseware, Woodgrove.
- Ids: reuse the fake ids already in the fixtures (Seek `10000001` upward, LinkedIn `1000000001` upward). Zero out `sol=` tokens, use `cdn.example.com` for image hosts, and remove `class` attributes from fixtures.
- After capturing a page, read every distinct text and attribute string, scrub them with a script that counts each replacement, then grep the repo for each original name, id and token. It must find nothing.
- No emails, local paths or secrets anywhere. `.env.submit` is for store credentials and must stay out of git.

## Security and privacy

- No network requests. Builds set a strict extension-pages CSP with `connect-src 'none'`, and Vite's module-preload polyfill is off because it contains `fetch()`. Never add `unlimitedStorage`, IndexedDB or a remote font, script or image.
- Every message from a content script is untrusted. The service worker validates it with zod, and the popup validates replies with the `CapturedJob` schema. `import '@/utils/zod-config'` is the first import of the background, popup and sheet entries. The click listener ignores `event.isTrusted === false`.
- Keep the length caps on `Job` text fields, links and ids in `store/job.ts`.
- Nothing is injected into Seek or LinkedIn pages: no badges, toasts or overlays (the sites' terms bar them). The service worker sets the toolbar dot.
- Never click Save or Apply on a real job page to test. It changes the user's account. Use fixtures.
- A change to what the extension stores, reads, requests or declares in the manifest also changes [docs/PRIVACY.md](docs/PRIVACY.md), the README and the store listing's permission justifications and data disclosure.

## Decisions already made

Do not reopen these without asking.

- No xstate, messaging library, react-query, TanStack Virtual or error boundary. The toolbar icon opens the popup. Excel export uses `write-excel-file`. Storage is one key per job.
- Versioning uses release-please, commit messages use commitlint and husky, and uploads use `wxt submit`. No changesets, semantic-release or manual version bumps.
- No unseen-captures counter, no nagging features and no number on the toolbar icon.
- Daily line: Chrome's on-device Prompt API only, never a model download, no Suspense, one popup row of at most 56 characters, one AI switch (default on) in the sheet's Settings. The prompt holds only whether the week was quiet, active or the best so far.
- Brand: blue `#2563eb` to violet `#7c3aed`, ink `#0f172a`, the system font (no bundled font), the logo lockup in headers. The name and logo are excluded from the MIT licence (see the README).
- Dev-toolchain audit findings that come in through `wxt` are accepted because they never ship. Add no `overrides` for them. Re-run `pnpm audit` before each store submission.
- Before the first store release there are no migrations or compatibility shims. After it, any `Job` schema change needs a migration, because `jobStore.list()` skips records that no longer validate and would hide users' data. Update this line when 0.1.0 is published.

## Dependencies

- `packageManager` pins pnpm and `.node-version` pins Node. pnpm adds a first YAML document to `pnpm-lock.yaml` for the pinned pnpm, which is expected.
- `pnpm-workspace.yaml` sets the supply-chain policies. Do not loosen them. Use registry packages only.
- Ask before `pnpm add`, `remove`, `audit`, `view` or `install`, any registry lookup, and the shadcn CLI. They send data out.
- CI actions are pinned by commit SHA in `.github/workflows/`.

## Git and releases

- Do not commit, stage or push. The maintainer runs git. End each change with a suggested commit message: a Conventional Commits type, then two to six words, with no body (see Releases). The working tree has `autocrlf` on, so CRLF warnings are harmless.
- Push only `main` and version tags, by name. Never `git push --all`.
- The store summary is the manifest `description` in `wxt.config.ts` (132 characters at most) and must match the dashboard. The long listing text lives in the dashboard. Store images are in `docs/store/` (screenshots 1280x800 24-bit PNG with no alpha, promo tile 440x280).

### Releases

release-please ([release.yml](.github/workflows/release.yml)) versions the extension. The store needs a higher number each upload, and it comes from the commits.

- Commit messages and PR titles follow Conventional Commits, because a squash merge uses the title as the commit message. `feat:` bumps the minor version. `fix:` and `perf:` bump the patch. `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:` and `style:` make no release. A `!` after the type marks a breaking change. Start the summary in lower case and leave off the full stop.
- commitlint ([commitlint.config.js](commitlint.config.js)) checks the rules. A husky `commit-msg` hook in `.husky/` runs it on each commit, and `postinstall` turns the hook on. The repo's squash merge must default to the PR title. CI checks no title, so keep a title you edit in GitHub in the same style.
- Dependabot titles start with `build(deps):`, so they make no release. Retitle one to `fix(deps):` to ship it.
- release-please keeps one release PR open. It bumps `version` in `package.json` and writes `CHANGELOG.md`. Check the gate on it, then merge it. The merge creates the `v<version>` tag and a GitHub Release.
- The release PR is opened with the `RELEASE_PLEASE_TOKEN` secret (a personal access token). Without it the workflow falls back to `GITHUB_TOKEN`, and CI does not run on the release PR.
- To upload to the Chrome Web Store, run the Submit workflow ([submit.yml](.github/workflows/submit.yml)) from the version tag, never from `main`. It runs `pnpm zip` and `wxt submit`. It uses Chrome Web Store API v2 and needs the repo secrets `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`. Before it runs, check that the permission justifications and data disclosure still match the manifest.
- `pnpm zip` and an upload in the dashboard still work by hand.

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
