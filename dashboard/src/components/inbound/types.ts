export type Lead = {
  id: string; created_at: string; source: string
  first_name: string | null; last_name: string | null
  email: string | null; phone: string | null; company: string | null
  department: string | null; contact_type: string | null
  topic: string | null; details: string | null; message: string | null
  page_url: string | null; status: string; notes?: string | null
  ai_draft_id: string | null; ai_draft_at: string | null
}

export type Filter = 'all' | 'new' | 'email' | 'whatsapp'
