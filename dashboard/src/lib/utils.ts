import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The one type scale (tailwind.config.ts fontSize) is registered here, so tailwind-merge reads
 * text-13 as a font size and keeps it beside a colour such as text-trs-ink; unregistered, it would
 * treat text-13 as a colour and drop one of the two.
 */
export const TYPE_SCALE = ['11', '12', '12.5', '13', '13.5', '14', '15', '16', '20', '24', '32'] as const

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TYPE_SCALE] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
