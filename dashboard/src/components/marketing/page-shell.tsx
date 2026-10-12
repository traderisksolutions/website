'use client'

// The page frame every Marketing screen shares: the 36px title, the facts line under it, the
// site switch, the actions on the right. Same shape as Sales → Leads.
import { AppSplitLayout, AppMainPanel } from '@/components/app-shell'
import { SiteSelect } from './site-switch'
import type { Site } from '@/lib/marketing/types'

export const INK = '#202124'
export const MUTED = '#5f6368'
export const RULE = '#e8eaed'

export function MarketingPage({ title, line, line2, actions, sites, siteKey, onSite, back, children, filters }: {
  title: React.ReactNode
  line?: React.ReactNode
  line2?: React.ReactNode
  actions?: React.ReactNode
  sites: Site[]
  siteKey: string | null
  onSite: (k: string) => void
  back?: React.ReactNode
  filters?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AppSplitLayout className="bg-white">
      <AppMainPanel className="bg-white">
        <div className="flex-shrink-0 px-6 sm:px-12 pt-10" style={{ color: INK }}>
          {back && <div className="mb-3 text-[13.5px]">{back}</div>}
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]" style={{ textWrap: 'balance' }}>{title}</h1>
              {line && <p className="m-0 mt-2 text-[15px]" style={{ color: MUTED }}>{line}</p>}
              {line2 && <p className="m-0 mt-1 text-[13.5px]" style={{ color: MUTED }}>{line2}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap pb-2">{actions}</div>
          </div>
          <div className="mt-5 pb-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: `1px solid ${RULE}` }}>
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <SiteSelect sites={sites} value={siteKey} onChange={onSite} />
              {filters}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 sm:px-12 pt-6 pb-16" style={{ color: INK }}>{children}</div>
      </AppMainPanel>
    </AppSplitLayout>
  )
}

export function Note({ children, role }: { children: React.ReactNode; role?: 'alert' | 'status' }) {
  return <p className="m-0 mb-4 text-[14px]" role={role} style={{ color: role === 'alert' ? INK : MUTED }}>{children}</p>
}
