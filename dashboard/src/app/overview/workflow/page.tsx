import dynamic from 'next/dynamic'
import Link from 'next/link'

const WorkflowCanvas = dynamic(() => import('./WorkflowCanvas'), { ssr: false })

const LEGEND = [
  { dot: '#0F3D91', label: 'Entry point' },
  { dot: '#C27A07', label: 'Human action' },
  { dot: '#7c3aed', label: 'AI action'    },
  { dot: '#0F8A5F', label: 'Data'         },
  { dot: '#667085', label: 'Output'       },
]

export default function WorkflowPage() {
  return (
    <div className="h-full flex flex-col">

      {/* ── Header strip ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-2 text-[11.5px] text-muted-foreground">
          <Link href="/overview" className="no-underline hover:text-foreground transition-colors">
            Overview
          </Link>
          <span>/</span>
          <span className="text-foreground">Workflow</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-foreground m-0 mb-0.5">
              Platform Workflow
            </h1>
            <p className="text-[12px] text-muted-foreground m-0">
              Click any node to learn what happens at that step, what AI does, and what you need to do.
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3.5 flex-wrap">
            {LEGEND.map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span
                  className="flex-shrink-0 inline-block rounded-full"
                  style={{ width: 7, height: 7, background: l.dot }}
                />
                <span className="text-[11px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Canvas + detail panel ── */}
      <div className="flex-1 min-h-0">
        <WorkflowCanvas />
      </div>

    </div>
  )
}
