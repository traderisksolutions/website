import { NextRequest, NextResponse } from 'next/server'
import {
  HOURLY_RATE_SGD,
  GEMINI_FEATURE_CONFIG,
  CAMPAIGN_ACTION_CONFIG,
  WORKFLOW_DEFS,
  type GeminiFeature,
} from '@/lib/kyn-roi/estimation-config'

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbHeaders() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export interface ActionBreakdown {
  action: string
  count: number
  minutesSaved: number
  hoursSaved: number
}

export interface WorkflowRow {
  id: string
  label: string
  description: string
  color: string
  runs: number
  hoursSaved: number
  estimatedValueSGD: number
  lastActive: string | null
  breakdown: ActionBreakdown[]
}

export interface TimeSeriesPoint {
  date: string
  hoursSaved: number
  runs: number
}

export interface KynRoiResponse {
  summary: {
    totalHoursSaved: number
    totalRuns: number
    estimatedValueSGD: number
    workflowsActive: number
  }
  workflows: WorkflowRow[]
  timeSeries: TimeSeriesPoint[]
}

type WorkflowAccum = {
  runs: number
  minutesSaved: number
  lastActive: string | null
  breakdown: Map<string, { count: number; minutesSaved: number; label: string }>
}

// GET /api/analytics/kyn-roi?since=ISO_DATE
export async function GET(req: NextRequest) {
  try {
    const since = req.nextUrl.searchParams.get('since')
    const dateFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : ''
    const headers = sbHeaders()

    const [geminiRes, campaignsRes] = await Promise.all([
      fetch(
        `${SB_URL}/rest/v1/gemini_usage_log?select=feature,created_at&order=created_at.desc${dateFilter}&limit=10000`,
        { headers }
      ),
      fetch(
        `${SB_URL}/rest/v1/ob_campaigns?select=id,created_at&order=created_at.desc${dateFilter}&limit=5000`,
        { headers }
      ),
    ])

    const geminiRows: { feature: string; created_at: string }[] =
      geminiRes.ok ? await geminiRes.json() : []
    const campaignRows: { id: string; created_at: string }[] =
      campaignsRes.ok ? await campaignsRes.json() : []

    const accum = new Map<string, WorkflowAccum>()
    const timeSeriesMap = new Map<string, { hoursSaved: number; runs: number }>()

    const ensureWorkflow = (id: string): WorkflowAccum => {
      if (!accum.has(id)) {
        accum.set(id, { runs: 0, minutesSaved: 0, lastActive: null, breakdown: new Map() })
      }
      return accum.get(id)!
    }

    const addEvent = (workflowId: string, label: string, minutesSaved: number, createdAt: string) => {
      const wf = ensureWorkflow(workflowId)
      wf.runs += 1
      wf.minutesSaved += minutesSaved
      if (!wf.lastActive || createdAt > wf.lastActive) wf.lastActive = createdAt

      if (!wf.breakdown.has(label)) {
        wf.breakdown.set(label, { count: 0, minutesSaved, label })
      }
      wf.breakdown.get(label)!.count += 1

      const date = createdAt.slice(0, 10)
      if (!timeSeriesMap.has(date)) timeSeriesMap.set(date, { hoursSaved: 0, runs: 0 })
      const bucket = timeSeriesMap.get(date)!
      bucket.hoursSaved += minutesSaved / 60
      bucket.runs += 1
    }

    for (const row of Array.isArray(geminiRows) ? geminiRows : []) {
      const cfg = GEMINI_FEATURE_CONFIG[row.feature as GeminiFeature]
      if (!cfg) continue
      addEvent(cfg.workflowId, cfg.label, cfg.minutesSaved, row.created_at)
    }

    for (const row of Array.isArray(campaignRows) ? campaignRows : []) {
      const cfg = CAMPAIGN_ACTION_CONFIG
      addEvent(cfg.workflowId, cfg.label, cfg.minutesSaved, row.created_at)
    }

    const workflows: WorkflowRow[] = WORKFLOW_DEFS
      .map(def => {
        const a = accum.get(def.id)
        if (!a || a.runs === 0) return null
        const hoursSaved = a.minutesSaved / 60
        const breakdown: ActionBreakdown[] = Array.from(a.breakdown.values()).map(b => ({
          action: b.label,
          count: b.count,
          minutesSaved: b.minutesSaved,
          hoursSaved: parseFloat(((b.count * b.minutesSaved) / 60).toFixed(2)),
        }))
        return {
          id: def.id,
          label: def.label,
          description: def.description,
          color: def.color,
          runs: a.runs,
          hoursSaved: parseFloat(hoursSaved.toFixed(2)),
          estimatedValueSGD: parseFloat((hoursSaved * HOURLY_RATE_SGD).toFixed(0)),
          lastActive: a.lastActive,
          breakdown,
        }
      })
      .filter((w): w is WorkflowRow => w !== null)
      .sort((a, b) => b.hoursSaved - a.hoursSaved)

    const totalHoursSaved = workflows.reduce((s, w) => s + w.hoursSaved, 0)
    const totalRuns       = workflows.reduce((s, w) => s + w.runs, 0)
    const estimatedValueSGD = parseFloat((totalHoursSaved * HOURLY_RATE_SGD).toFixed(0))

    const timeSeries: TimeSeriesPoint[] = Array.from(timeSeriesMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        hoursSaved: parseFloat(v.hoursSaved.toFixed(2)),
        runs: v.runs,
      }))

    const response: KynRoiResponse = {
      summary: {
        totalHoursSaved: parseFloat(totalHoursSaved.toFixed(1)),
        totalRuns,
        estimatedValueSGD,
        workflowsActive: workflows.length,
      },
      workflows,
      timeSeries,
    }

    return NextResponse.json(response)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
