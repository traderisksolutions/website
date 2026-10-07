/* TRS Analytics — Vercel Web Analytics custom events + session id + lead capture hook.
 *
 * Writes nothing to a database from the browser. Leads go through POST /api/lead, which
 * validates server-side and writes to the TRS database on GCP (Cloud SQL via trs-api).
 */
(function () {
  /* ── Session ID (persists for the browser tab lifetime) ── */
  var SESSION_KEY = 'trs_sid';

  function getOrCreateSessionId() {
    var id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!id) {
      id = 'trs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      try { sessionStorage.setItem(SESSION_KEY, id); } catch (e) {}
    }
    return id;
  }

  /* ── Vercel custom event helper ── */
  function vaEvent(name, props) {
    if (typeof window.va === 'function') {
      window.va('event', Object.assign({ name: name }, props || {}));
    }
  }

  var sessionId = getOrCreateSessionId();
  var page      = window.location.pathname === '/' ? 'Landing page' : window.location.pathname;

  // Exposed so nav.js's contact popover can tag its /api/lead submissions with the same id.
  window.trsSessionId = function () { return sessionId; };

  /* ── Lead capture hook — used by the claims form ──
   * trsCaptureLead(fieldsObject, source, cb) posts to /api/lead.
   * cb(ok) is called with true only when the lead was saved.
   */
  window.trsCaptureLead = function (data, source, cb) {
    var body = {};
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) body[k] = data[k];
    body.source     = source || 'website_form';
    body.page_url   = page;
    body.session_id = sessionId;
    fetch('/api/lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }).then(function (res) {
      if (cb) cb(res.ok);
    }).catch(function () {
      if (cb) cb(false);
    });
  };

  /* ── Button / link click tracking → Vercel custom events ── */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;
    vaEvent('button_click', { label: el.dataset.track, page: page });
  });
})();
