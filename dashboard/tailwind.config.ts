import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
      },
      colors: {
        sidebar: {
          bg:        '#0c0c0c',
          text:      'rgba(255,255,255,0.62)',
          active:    '#ffffff',
          activebg:  'rgba(255,255,255,0.08)',
          border:    'rgba(255,255,255,0.08)',
          label:     'rgba(255,255,255,0.28)',
        },
      },
      width: { sidebar: 'var(--sidebar-width)' },
      height: { topnav: 'var(--topnav-height)' },
    },
  },
  plugins: [],
}
export default config
