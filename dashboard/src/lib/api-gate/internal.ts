// Headers for a server-to-server call this app makes to its OWN API.
//
// The Python analyzers (api/pm_dump.py, api/analyze_xlsx.py) are Vercel
// functions, not Next route handlers, and are invoked by fetch() from
// three Next routes. Those calls carry no session cookie — nothing about
// them looks like a browser — so once the gate is enforcing they need the
// machine pair the crons already use: a key naming the caller, and
// CRON_SECRET as the actor.
//
// Deliberately not exempting /api/pm_dump and /api/analyze_xlsx in the
// policy instead. They receive a signed Storage URL and parse whatever
// workbook is behind it, which is real compute and a real parser surface;
// "internal only" is worth actually enforcing rather than asserting.
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (process.env.INTERNAL_API_KEY) headers['x-api-key'] = process.env.INTERNAL_API_KEY
  if (process.env.CRON_SECRET) headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`
  return headers
}
