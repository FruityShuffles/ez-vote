import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // Keep last: turns off ESLint rules that conflict with Prettier formatting.
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn primitives are owned source that intentionally co-export a
    // component and its `cva` variants (e.g. Button + buttonVariants); the
    // react-refresh component-only rule is a false positive here.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
