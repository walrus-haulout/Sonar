import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sonar: {
          abyss: '#0A172A',
          deep: '#092E4D',
          blue: '#0E4B6F',
          signal: '#1AA4D9',
          highlight: '#74E4FF',
          'highlight-bright': '#B8F0FF', // WCAG AAA compliant on dark
          coral: '#FF6B4A',
        },
      },
      fontFamily: {
        mono: ['var(--font-ibm-plex-mono)', 'IBM Plex Mono', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      spacing: {
        18: '4.5rem',
        30: '7.5rem',
        42: '10.5rem',
      },
      boxShadow: {
        sonar: '0 0 30px rgba(26, 164, 217, 0.35)',
        'sonar-lg': '0 0 60px rgba(26, 164, 217, 0.5)',
        depth: '0 20px 40px rgba(0, 0, 0, 0.6)',
      },
      backdropBlur: {
        sonar: '24px',
      },
      letterSpacing: {
        radar: '0.2em',
      },
      lineHeight: {
        sonar: '0.95',
      },
      borderRadius: {
        sonar: '18px',
      },
      animation: {
        'sweep': 'sweep 4s linear infinite',
        'pulse-sonar': 'pulseSonar 1.5s ease-out',
      },
      keyframes: {
        sweep: {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
        pulseSonar: {
          '0%': { transform: 'scale(0)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
