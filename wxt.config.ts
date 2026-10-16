import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Extension pages and the service worker may load only what the package holds and connect to
// nothing, so the browser enforces the no-network promise. The UI libraries need inline styles.
const EXTENSION_PAGES_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Chrome 116+ preloads modules natively. Vite's polyfill is dead code there, but it contains a
  // fetch() call, and this extension promises that it makes no network requests.
  vite: () => ({
    plugins: [tailwindcss()],
    build: { modulePreload: { polyfill: false } },
  }),
  manifest: ({ command }) => ({
    name: 'Jobmark: Job Application Tracker',
    description:
      'Logs the jobs you save and apply for on Seek and LinkedIn in a private sheet in your browser. No account needed.',
    minimum_chrome_version: '116', // runtime.getContexts, used to reuse an open sheet tab
    permissions: ['storage', 'scripting', 'activeTab'],
    // The dev server needs a socket to the page for hot reload, so only a build is locked down.
    content_security_policy:
      command === 'build' ? { extension_pages: EXTENSION_PAGES_CSP } : undefined,
  }),
});
