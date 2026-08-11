// Core types for the learning-loop library. A "surface" is any place the app generates AI
// text that gets human-corrected (an engagement email_type, an RFQ surface, the Ask-Opus
// chat consultant, etc) — the existing code calls this `email_type`, kept as the field name
// here so it round-trips with the DB without a rename migration.

export type Surface = string

export interface EvalInput {
  surface:      Surface
  aiOutput:     string
  humanOutput:  string
  substance:    number // 1-5
  style:        number // 1-5
  editType:     'none' | 'style' | 'substance' | 'both'
  whatChanged:  string
  whyBetter:    string
  keyLearning:  string
  contextSummary: string
  draftId?:     string
  threadId?:    string | null
}

export interface EvalRecord {
  id:         string
  surface:    Surface
  draftId:    string | null
  threadId:   string | null
  score:      number
  substanceScore: number | null
  styleScore:     number | null
  editType:       string | null
  keyLearning:    string
  whyBetter:      string
  whatChanged:    string
  contextSummary: string
  createdAt:      string
}

export interface SurfaceStats {
  surface:   Surface
  count:     number
  avgScore:  number
}

// A promoted few-shot example — Hermes calls the analogous concept a "skill artifact";
// here it's just a high-scoring human-sent reply worth showing the model again.
export interface SkillExample {
  id:             string
  surface:        Surface
  contextSummary: string
  idealOutput:    string
  score:          number
  createdAt:      string
}

export type SkillStatus = 'active' | 'superseded' | 'pinned' | 'deprecated'

// A synthesized instruction block for a surface — versioned (insert-only), with an explicit
// lifecycle so the dashboard can recommend promoting/deprecating one instead of only ever
// showing "whatever was synthesized most recently".
export interface SkillVersion {
  id:              string
  surface:         Surface
  instructionText: string
  sourceEvalCount: number | null
  status:          SkillStatus
  synthesizedAt:   string
  createdAt:       string
}
