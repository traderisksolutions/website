import { EvalStore } from './eval-store'
import { SkillSynthesizer } from './skill-synthesizer'
import type { LearningLoopDB } from './db'
import type { Surface } from './types'

export interface SkillRecommendation {
  surface: Surface
  action:  'pin' | 'deprecate' | 'none'
  reason:  string
  sampleSize: number
  avgScore:   number
}

const MIN_SAMPLE = 5
const PIN_AVG_THRESHOLD = 4.5
const DEPRECATE_AVG_THRESHOLD = 3

/** Heuristic recommendation for one surface's currently-effective skill version, based on
 *  how evals have scored since it went live. Deliberately simple and explainable (a sample
 *  size + average score threshold) rather than a model — the dashboard shows the numbers
 *  behind the call so a human can override it. */
export async function recommendForSurface(db: LearningLoopDB, surface: Surface): Promise<SkillRecommendation> {
  const evalStore = new EvalStore(db)
  const synthesizer = new SkillSynthesizer(db, { compose: async () => null })
  const effective = await synthesizer.getEffective(surface)

  const since = effective?.synthesizedAt
  const recent = await evalStore.listRecent({ surface, limit: 200 })
  const sample = since ? recent.filter(e => e.createdAt > since) : recent
  const sampleSize = sample.length
  const avgScore = sampleSize ? Math.round((sample.reduce((sum, e) => sum + e.score, 0) / sampleSize) * 10) / 10 : 0

  if (sampleSize < MIN_SAMPLE) {
    return { surface, action: 'none', reason: `only ${sampleSize} evals since this version went live — not enough signal yet`, sampleSize, avgScore }
  }
  if (effective?.status !== 'pinned' && avgScore >= PIN_AVG_THRESHOLD) {
    return { surface, action: 'pin', reason: `avg score ${avgScore}/5 over ${sampleSize} evals — stable and strong, lock it in`, sampleSize, avgScore }
  }
  if (avgScore < DEPRECATE_AVG_THRESHOLD) {
    return { surface, action: 'deprecate', reason: `avg score ${avgScore}/5 over ${sampleSize} evals — underperforming, retire or resynthesize`, sampleSize, avgScore }
  }
  return { surface, action: 'none', reason: `avg score ${avgScore}/5 over ${sampleSize} evals — within normal range`, sampleSize, avgScore }
}

export async function recommendForAllSurfaces(db: LearningLoopDB, surfaces: Surface[]): Promise<SkillRecommendation[]> {
  return Promise.all(surfaces.map(s => recommendForSurface(db, s)))
}
