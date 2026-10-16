import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const CONTENT_BUNDLE_MESSAGE =
  'Content scripts must stay tiny. Import only types from this module here.';
const ENTRYPOINTS_PATTERN = {
  group: ['@/entrypoints/*'],
  message: 'Shared code cannot depend on an entrypoint.',
};

export default tseslint.config(
  { ignores: ['.output', '.wxt', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        browser: 'readonly',
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
      },
    },
  },
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'console', message: "Use the logger from '@/utils/logger'." },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'SpreadElement', message: 'Spreading is forbidden.' },
        { selector: 'JSXSpreadAttribute', message: 'Spreading props is forbidden.' },
        {
          selector: 'ExportNamedDeclaration[source], ExportAllDeclaration',
          message: 'Re-exports are forbidden. Import from the module that defines it.',
        },
        {
          selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign']",
          message: 'Object.assign is forbidden.',
        },
        {
          selector: [
            'CatchClause > BlockStatement[body.length=0]',
            "CallExpression[callee.property.name='catch'] > :function[body.type='BlockStatement'][body.body.length=0]",
          ].join(', '),
          message:
            'An empty catch hides the error, even with a comment inside. Log it, return a value or rethrow.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['variable', 'parameter', 'typeProperty'],
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'can', 'should', 'did', 'will'],
        },
      ],
    },
  },
  // Content scripts stay tiny, so they cannot bundle the pino logger and use the console.
  { files: ['src/content/**'], rules: { 'no-restricted-properties': 'off' } },
  // Boundaries between layers.
  {
    // A content script bundle carries no zod, storage library, logger, dates or React, because it
    // runs inside every page of a job site. Types are erased, so they may come from anywhere.
    files: ['src/content/**/*.{ts,tsx}', 'src/sites/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', 'src/sites/fixtures/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            'zod',
            'date-fns',
            'pino',
            'react',
            'react-dom',
            'write-excel-file',
            '#imports',
          ].map((name) => ({ name, allowTypeImports: true, message: CONTENT_BUNDLE_MESSAGE })),
          patterns: [
            {
              group: [
                '@/store/job',
                '@/store/job-store',
                '@/store/job-stats',
                '@/messages/*',
                '@/hooks/*',
                '@/components/*',
                '@/utils/logger',
                '@/utils/format-date',
                '@/utils/open-sheet',
                '@/utils/download-file',
                '@/utils/write-or-report',
              ],
              allowTypeImports: true,
              message: CONTENT_BUNDLE_MESSAGE,
            },
            ENTRYPOINTS_PATTERN,
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/components/**/*.{ts,tsx}',
      'src/store/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/utils/**/*.{ts,tsx}',
      'src/messages/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.*'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [ENTRYPOINTS_PATTERN] }],
    },
  },
  // Each context (popup, sheet, background) keeps its own code and shares through the layers.
  ...['popup', 'sheet', 'background'].map((context) => ({
    files: [`src/entrypoints/${context}/**/*.{ts,tsx}`],
    ignores: ['**/*.test.*'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['popup', 'sheet', 'background']
                .filter((other) => other !== context)
                .map((other) => `@/entrypoints/${other}/*`),
              message:
                'An entrypoint keeps its own code. Share code through components, hooks, store, sites or utils.',
            },
          ],
        },
      ],
    },
  })),
  // shadcn-generated components spread props; keep them upstream-compatible.
  {
    files: ['src/components/ui/**'],
    rules: { 'no-restricted-syntax': 'off', '@typescript-eslint/naming-convention': 'off' },
  },
  prettier,
);
