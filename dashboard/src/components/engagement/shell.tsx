'use client'

/**
 * EngagementShell
 *
 * Thin layout wrapper for the Engagement Agent page.
 * Responsibilities:
 *   1. Imports tokens.css — activates --ea-* design tokens for this subtree.
 *   2. Applies data-ea attribute — scopes token activation to this element.
 *   3. Provides the full-height flex root the engagement layout needs.
 *
 * Why a separate component instead of importing CSS directly in page.tsx:
 *   - Makes the "scope boundary" explicit and visible in JSX
 *   - Keeps page.tsx focused on data orchestration, not styling concerns
 *   - Easy to find, easy to remove if the approach changes
 *
 * Other pages are not affected — data-ea only exists inside this wrapper,
 * and the CSS import does not modify any global selectors.
 */

import './tokens.css'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface EngagementShellProps {
  children:   ReactNode
  className?: string
}

export function EngagementShell({ children, className }: EngagementShellProps) {
  return (
    <div
      data-ea
      className={cn(
        'flex overflow-hidden flex-col',
        'h-[calc(100vh-var(--mobile-nav-h,0px))]',
        className,
      )}
    >
      {children}
    </div>
  )
}
