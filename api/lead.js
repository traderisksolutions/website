// POST /api/lead
//
// Server-side validated write for the contact popover (scripts/nav.js), replacing the
// previous client-side insert straight to Supabase with the anon key. Requires a
// SUPABASE_SERVICE_KEY env var to be set on THIS Vercel project (trs-website) — it does not
// carry over from the dashboard's separate Vercel project. SUPABASE_URL falls back to the
// same project the anon-key client used, so only the one new env var is strictly required.
//
// Same Supabase project as the dashboard (ctjapwjpwkvxubdmzbqg) — writes land in
// inbound_leads, which the dashboard's auto-draft/notification/pipeline already consume.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ctjapwjpwkvxubdmzbqg.supabase.co';

const VALID_SOURCES = ['manual', 'website_form', 'whatsapp_click', 'email'];

function isValidEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function clip(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const body = req.body || {};

  // Honeypot — a field no real visitor sees or fills (see .nav-ctac-hp in styles/main.css).
  // Pretend success and drop it silently rather than telling a bot its guess was wrong.
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  if (!VALID_SOURCES.includes(body.source)) {
    res.status(400).json({ error: 'invalid source' });
    return;
  }
  if (!body.first_name || !body.last_name) {
    res.status(400).json({ error: 'first_name and last_name are required' });
    return;
  }
  if (body.source === 'website_form' && !isValidEmail(body.email)) {
    res.status(400).json({ error: 'a valid email is required' });
    return;
  }

  const record = {
    source:       body.source,
    first_name:   clip(String(body.first_name).trim(), 200),
    last_name:    clip(String(body.last_name).trim(), 200),
    email:        body.email || null,
    phone:        body.phone || null,
    company:      body.company || null,
    department:   body.department || null,
    contact_type: body.contact_type || null,
    topic:        body.topic || null,        // human-readable label, for display
    product_line: body.product_line || null, // canonical taxonomy slug, for the dashboard
    details:      clip(body.details, 4000),
    message:      clip(body.message, 4000),
    page_url:     clip(body.page_url, 500),
    session_id:   clip(body.session_id, 200),
    status:       'new',
  };

  try {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/inbound_leads`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    });
    if (!sbRes.ok) {
      const detail = await sbRes.text().catch(() => '');
      res.status(502).json({ error: 'failed to save lead', detail: detail.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
};
