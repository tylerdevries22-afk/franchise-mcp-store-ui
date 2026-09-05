import eslint from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  hooks.configs['recommended-latest'],
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
);
