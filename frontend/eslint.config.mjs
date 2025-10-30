import nextConfig from 'eslint-config-next';
import typescriptEslint from 'typescript-eslint';

export default [
  ...typescriptEslint.configs.recommended,
  ...nextConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'react/no-unescaped-entities': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
