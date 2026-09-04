import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

const browserGlobals = {
  browser: 'readonly',
  node: 'readonly',
};

const tsRules = {
  'no-unused-vars': 'off',
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]+$' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-namespace': 'off',
  '@typescript-eslint/semi': 'off',
  '@typescript-eslint/consistent-type-imports': 'error',
  'prettier/prettier': 'error',
};

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '*.min.js',
      '*.min.css',
      '.eslintrc.*',
      '.prettierrc.*',
    ],
  },

  // Base JavaScript recommended rules
  js.configs.recommended,

  // Vue 3 recommended rules
  ...vue.configs['flat/recommended'],

  // Prettier compatibility
  prettierConfig,

  // JavaScript files
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: {
      prettier: prettier,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },

  // TypeScript files
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: tsRules,
  },

  // Vue files
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: browserGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      vue: vue,
      prettier: prettier,
    },
    rules: {
      ...tsRules,
      'vue/multi-word-component-names': 'off',
    },
  },
];
