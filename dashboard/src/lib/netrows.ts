// Shared Netrows email-finder call, used both by the standalone "look up a LinkedIn URL"
// tool (api/outbound/generate-email) and as an automatic fallback inside apollo-email when
// Apollo's own people/match doesn't reveal an email for a person.

const NETROWS = 'https://api.netrows.com/v1'

function netHead() {
  return { Authorization: `Bearer ${process.env.NETROWS_API_KEY}` }
}

export async function findEmailByLinkedIn(
  linkedinUrl: string
): Promise<{ email: string; status: string } | null> {
  if (!process.env.NETROWS_API_KEY || !linkedinUrl) return null

  try {
    const res = await fetch(
      `${NETROWS}/email-finder/by-linkedin?linkedin_url=${encodeURIComponent(linkedinUrl)}`,
      { headers: netHead() as HeadersInit }
    )
    if (!res.ok) return null // includes 402 insufficient-credits — treat as "not found", not fatal

    const data  = await res.json()
    const email = data.valid_email ?? data.email ?? null
    if (!email) return null

    return { email, status: data.email_status ?? 'valid' }
  } catch {
    return null
  }
}
