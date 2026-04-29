import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
  'no-unused-vars': ['warn', { 
    argsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_'
  }],
  'no-undef': 'error'
  
}
  }
];
