import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)', 'Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['var(--font-serif)', 'EB Garamond', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'Geist Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        // Revamp tokens (globals.css :root). Use these in class names instead of hex literals.
        trs: {
          green: 'var(--trs-green)', 'green-2': 'var(--trs-green-2)', mint: 'var(--trs-mint)', soft: 'var(--trs-soft)', lime: 'var(--trs-lime)',
          ink: 'var(--trs-ink)', 'ink-2': 'var(--trs-ink-2)', muted: 'var(--trs-muted)', subtle: 'var(--trs-subtle)',
          line: 'var(--trs-line)', 'line-2': 'var(--trs-line-2)', canvas: 'var(--trs-canvas)', field: 'var(--trs-field)', tint: 'var(--trs-tint)',
          'select-bg': 'var(--trs-select-bg)', 'select-fg': 'var(--trs-select-fg)',
          pos: 'var(--trs-pos)', 'pos-bg': 'var(--trs-pos-bg)', warn: 'var(--trs-warn)', 'warn-bg': 'var(--trs-warn-bg)',
          neg: 'var(--trs-neg)', 'neg-bg': 'var(--trs-neg-bg)', info: 'var(--trs-info)', 'info-bg': 'var(--trs-info-bg)',
        },
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Deep navy blue sidebar palette
        sidebar: {
          DEFAULT:              'hsl(var(--sidebar-bg))',
          foreground:           'hsl(var(--sidebar-fg))',
          primary:              'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-fg))',
          accent:               'hsl(var(--sidebar-accent))',
          'accent-foreground':  'hsl(var(--sidebar-accent-fg))',
          border:               'hsl(var(--sidebar-border))',
          ring:                 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg:   'var(--radius)',
        md:   'calc(var(--radius) - 2px)',
        sm:   'calc(var(--radius) - 4px)',
        xl:   'calc(var(--radius) + 4px)',
        '2xl':'calc(var(--radius) + 8px)',
      },
      width:  { sidebar: 'var(--sidebar-width)' },
      height: { topnav:  'var(--topnav-height)' },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        // Indeterminate progress bar — a segment sweeps left→right.
        'trs-indeterminate': {
          '0%':   { left: '-40%', width: '40%' },
          '50%':  { left: '30%',  width: '55%' },
          '100%': { left: '100%', width: '40%' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.15s ease-out',
        'trs-indeterminate': 'trs-indeterminate 1.1s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
