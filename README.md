<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/assets/jobmark-lockup-dark.svg">
  <img src="src/assets/jobmark-lockup.svg" alt="Jobmark" height="48">
</picture>

# Jobmark: Job Application Tracker

A Chrome extension that logs the jobs you save and apply for on job posting platforms, in a private sheet that lives in your browser.

![The Jobmark sheet with a list of tracked jobs](docs/store/1-sheet.png)

## ✨ What it does

- ✅ **Apply as usual.** It records the job when you apply or save it. Only Seek and LinkedIn are supported.
- 🟢 **Toolbar dot.** A small dot on the toolbar icon shows the status of the job you are viewing.
- ✍️ **Manual saving.** You can always add a job yourself from the toolbar popup, on any website.
- 📊 **Your sheet.** Sort, search, filter, edit any cell, add notes, change status and delete with undo.
- 📦 **Yours to keep.** Export to CSV or Excel, and back up or import everything as JSON.
- 💌 **A kind word.** A warm daily message based on your job hunting journey, written by on-device AI when available.

## 🔒 Privacy

Everything stays on your computer. There are no accounts, no servers, no analytics and no network requests. See [docs/PRIVACY.md](docs/PRIVACY.md).

Removing the extension deletes its data, so use **Back up** in the sheet now and then.

## 🚀 Install

The extension is not on the Chrome Web Store yet. To run it from source you need Node 24.18.0 and [pnpm](https://pnpm.io) 12.11.2 (pinned in `.node-version` and `package.json`):

```sh
pnpm install
pnpm build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3`. Chrome 116 or newer is required.

## 🛠️ Development

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Run the extension in dev mode with hot reload |
| `pnpm build`        | Production build to `.output/`                |
| `pnpm zip`          | Store-ready zip in `.output/`                 |
| `pnpm typecheck`    | Type-check                                    |
| `pnpm lint`         | Lint                                          |
| `pnpm test`         | Run tests                                     |
| `pnpm format`       | Format with Prettier                          |
| `pnpm seed [count]` | Write sample jobs to `seed/` (default 500)    |

Built with [WXT](https://wxt.dev), TypeScript, React, Tailwind CSS and [shadcn/ui](https://ui.shadcn.com).

## 🤝 Contributing

Interested in contributing? Feel free to raise a pull request.

## 📄 Licence

[MIT](LICENSE)

The Jobmark name and logo (`src/assets/icon.svg`, `src/assets/jobmark-lockup*.svg` and `public/icon/`) are not covered by the MIT licence. If you fork the project, please use your own name and logo.
