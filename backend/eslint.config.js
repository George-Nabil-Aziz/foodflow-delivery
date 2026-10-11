export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'seeds/**/*.js', 'migrations/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        Intl: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    /**
     * NFR-1 / BR-F1: a module may import another module only through its public
     * index.js. Expressed as a regex rather than a glob because the glob form
     * also matched the legitimate `../<module>/index.js` imports.
     *
     * Matches `../<module>/<anything-but-index.js>`; `../../shared/...` and
     * same-module relative imports (`./x.js`) are unaffected.
     */
    files: ['src/modules/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./[a-zA-Z-]+/(?!index\\.js$).+$',
              message:
                'Cross-module imports must go through the module index.js (NFR-1).',
            },
          ],
        },
      ],
    },
  },
  {
    /** BR-F2: controllers read req.validated, never the raw request. */
    files: ['src/modules/**/*.controller.js'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'req', property: 'body', message: 'Read req.validated.body (BR-F2).' },
        { object: 'req', property: 'query', message: 'Read req.validated.query (BR-F2).' },
      ],
    },
  },
];
