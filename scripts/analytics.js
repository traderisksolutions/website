/* TRS Analytics — Vercel Web Analytics + Supabase session/event tracking
 *
 * Setup: after creating your Supabase project, replace the two placeholders below.
 * Run supabase/schema.sql in your Supabase SQL editor first.
 */
(function () {
  var SUPABASE_URL      = 'https://ctjapwjpwkvxubdmzbqg.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0amFwd2pwd2t2eHViZG16YnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTg2MDgsImV4cCI6MjA5MTgzNDYwOH0.4584ADBn954hiF3qFm5wmhw2RVYfMHKi4aX_ECdqAqA';

  var CONFIGURED = true;

  /* ── Session ID (persists for the browser tab lifetime) ── */
  var SESSION_KEY      = 'trs_sid';
  var SESSION_INIT_KEY = 'trs_sid_init';

  function getOrCreateSessionId() {
    var id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'trs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  /* ── Supabase REST helpers ── */
  function sbInsert(table, payload) {
    if (!CONFIGURED) return;
    fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method:    'POST',
      headers:   {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer':        'return=minimal'
      },
      body:      JSON.stringify(payload),
      keepalive: true
    }).catch(function () {});
  }

  function sbPatch(table, filter, payload) {
    if (!CONFIGURED) return;
    fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + filter, {
      method:    'PATCH',
      headers:   {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer':        'return=minimal'
      },
      body:      JSON.stringify(payload),
      keepalive: true
    }).catch(function () {});
  }

  /* ── Vercel custom event helper ── */
  function vaEvent(name, props) {
    if (typeof window.va === 'function') {
      window.va('event', Object.assign({ name: name }, props || {}));
    }
  }

  /* ── Init ── */
  var sessionId   = getOrCreateSessionId();
  var page        = window.location.pathname === '/' ? 'Landing page' : window.location.pathname;
  var isNewSession = !sessionStorage.getItem(SESSION_INIT_KEY);

  if (isNewSession) {
    sessionStorage.setItem(SESSION_INIT_KEY, '1');
    sbInsert('sessions', {
      session_id:   sessionId,
      first_page:   page,
      referrer:     document.referrer || null,
      user_agent:   navigator.userAgent,
      language:     navigator.language,
      screen_width:  screen.width,
      screen_height: screen.height
    });
  } else {
    sbPatch(
      'sessions',
      'session_id=eq.' + encodeURIComponent(sessionId),
      { last_seen_at: new Date().toISOString() }
    );
  }

  /* ── Page view ── */
  sbInsert('page_views', {
    session_id: sessionId,
    page:       page,
    referrer:   document.referrer || null
  });

  /* ── Global lead capture hook — called by nav.js popover ──
   * Accepts either:
   *   trsCaptureLead(stringMsg, source)          — WhatsApp (raw message)
   *   trsCaptureLead(fieldsObject, source)        — Email form (structured)
   */
  window.trsCaptureLead = function (data, source) {
    var record = {
      source:     source || 'website_form',
      page_url:   page,
      session_id: sessionId,
      status:     'new'
    };
    if (typeof data === 'string') {
      record.message = data;
    } else {
      record.first_name   = data.first_name   || null;
      record.last_name    = data.last_name    || null;
      record.email        = data.email        || null;
      record.phone        = data.phone        || null;
      record.company      = data.company      || null;
      record.department   = data.department   || null;
      record.contact_type = data.contact_type || null;
      record.topic        = data.topic        || null;
      record.details      = data.details      || null;
      record.message      = data.message      || null;
    }
    sbInsert('inbound_leads', record);
  };

  /* ── Button / link click tracking ──
   * Listens for clicks on any element with data-track="label"
   * Logs to Supabase events table + fires Vercel custom event
   */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;

    var label = el.dataset.track;
    var text  = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80);

    sbInsert('events', {
      session_id:    sessionId,
      event_type:    'button_click',
      page:          page,
      element_label: label,
      element_id:    el.id || null,
      metadata:      { text: text, href: el.href || null }
    });

    vaEvent('button_click', { label: label, page: page });

    /* ── Inbound lead capture — WhatsApp send buttons ── */
    if (label === 'whatsapp_send' || label === 'contact_card_send') {
      var msg = '';
      if (label === 'whatsapp_send') {
        var mainInput = document.getElementById('cta-input');
        if (mainInput) msg = mainInput.value.trim();
      } else {
        var cardInput = document.getElementById('ctac-input');
        if (cardInput) msg = cardInput.value.trim();
      }
      if (msg) {
        sbInsert('inbound_leads', {
          source:     'whatsapp_click',
          message:    msg,
          page_url:   page,
          session_id: sessionId,
          status:     'new'
        });
      }
    }
  });
})();
