/**
 * Singapore-anchored "now"/"today" — for anywhere the app needs the current date to mean
 * Singapore time specifically, not whatever timezone the runtime happens to be in.
 *
 * `new Date()` reflects the RUNTIME's clock: on Vercel that's UTC (server-side calculations,
 * cron jobs, API routes), and in a browser it's whatever the device's OS timezone is (fine for
 * SG-based staff on a correctly-set machine, wrong for anyone traveling or on a misconfigured
 * clock). Since SGT is UTC+8, `new Date()` on a UTC server is up to 8 hours BEHIND Singapore —
 * during SGT 00:00–07:59 it still reports the previous calendar day, silently shifting any
 * "today" default (a quote's effective date, a calendar "today" highlight, an age-as-of
 * calculation) back a day. Use these helpers instead wherever that distinction matters.
 */

const SGT_TIMEZONE = 'Asia/Singapore'

/**
 * A Date object whose LOCAL components (getFullYear/getMonth/getDate/getHours/...) reflect the
 * current Singapore wall-clock time, regardless of the runtime's actual timezone — so it drops
 * straight into existing local-component date logic (isSameDay, toISODate-style formatting,
 * age-as-of math) without those call sites needing to know about timezones at all.
 */
export function nowSGT(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SGT_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  // Intl's hour12:false can format midnight as "24" in some engines — normalize to 0.
  const hour = get('hour') % 24
  return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
}

/** Today's date in Singapore Time as YYYY-MM-DD — for document/effective-date defaults. */
export function todaySGT(): string {
  const d = nowSGT()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
