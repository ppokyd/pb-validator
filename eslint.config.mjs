import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/', '**/node_modules/', 'schemas/', 'packages/js/src/generated/'] },

  eslint.configs.recommended,

  {
    files: ['**/*.{js,mjs}'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['packages/js/src/**/*.ts'],
    extends: tseslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['demo/src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        require: 'readonly',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  {
    files: ['demo/webpack.config.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  {
    files: ['tools/**/*.mjs', 'packages/js/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },

  prettier,
);
