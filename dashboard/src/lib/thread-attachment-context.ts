// Builds a text block of a thread's attachment contents (parsed_text stored by the Nexus
// attachment extractor) so the engagement AI — analysis AND reply generation — always reads
// what's in the PDFs / Excel / attached emails, not just the email body. Nexus analysis reads
// attachments separately (run-nexus-analysis.ts); this covers the engagement side.

const SB_URL = 'https://ctjapwjpwkvxubdmzbqg.supabase.co'

function sbH() {
  const k = process.env.SUPABASE_SERVICE_KEY
  if (!k) throw new Error('SUPABASE_SERVICE_KEY not set')
  return { apikey: k, Authorization: `Bearer ${k}` }
}

/**
 * Returns a formatted block of the thread's attachment text, or '' if none.
 * Deduplicates by filename (same doc appears on multiple messages) and caps total length.
 */
export async function fetchAttachmentContext(threadId: string | null, maxChars = 14000): Promise<string> {
  if (!threadId) return ''
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/email_attachments?thread_id=eq.${encodeURIComponent(threadId)}&select=filename,parsed_text&order=created_at.asc`,
      { headers: sbH(), cache: 'no-store' }
    )
    const rows: { filename: string; parsed_text: string | null }[] = res.ok ? await res.json() : []

    const seen = new Set<string>()
    const withText = rows.filter(r => {
      if (!r.parsed_text || !r.parsed_text.trim()) return false
      if (seen.has(r.filename)) return false
      seen.add(r.filename)
      return true
    })
    if (withText.length === 0) return ''

    let out = ''
    for (const r of withText) {
      if (out.length >= maxChars) { out += `\n\n[Attachment: ${r.filename}] — omitted (context limit reached)`; break }
      const text = r.parsed_text!.trim().slice(0, maxChars - out.length)
      out += `\n\n[Attachment: ${r.filename}]\n${text}`
    }
    return out.trim()
  } catch {
    return ''
  }
}
