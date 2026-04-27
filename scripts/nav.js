(function () {
  var nav       = document.querySelector('.nav');
  var hamburger = document.querySelector('.nav-hamburger');
  var overlay   = document.querySelector('.nav-drawer-overlay');
  var closeBtn  = document.querySelector('.nav-drawer-close');

  /* ── Scroll → pill transform ── */
  var THRESHOLD = 60;
  function onScroll() {
    nav.classList.toggle('nav--scrolled', window.scrollY > THRESHOLD);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile drawer ── */
  function openDrawer()  { document.body.classList.add('drawer-open'); }
  function closeDrawer() { document.body.classList.remove('drawer-open'); }

  if (hamburger) hamburger.addEventListener('click', openDrawer);
  if (overlay)   overlay.addEventListener('click', closeDrawer);
  if (closeBtn)  closeBtn.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  /* ── Desktop dropdowns (hover) ── */
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(function (dd) {
    var leaveTimer;

    dd.addEventListener('mouseenter', function () {
      clearTimeout(leaveTimer);
      dropdowns.forEach(function (other) { if (other !== dd) other.classList.remove('open'); });
      dd.classList.add('open');
    });

    dd.addEventListener('mouseleave', function () {
      leaveTimer = setTimeout(function () { dd.classList.remove('open'); }, 120);
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-dropdown')) {
      dropdowns.forEach(function (dd) { dd.classList.remove('open'); });
    }
  });

  /* ── Dynamic right column: hover left items ── */
  document.querySelectorAll('.nav-dd-item[data-target]').forEach(function (btn) {
    btn.addEventListener('mouseenter', function () {
      var panel = btn.closest('.nav-dropdown-panel');
      var target = btn.dataset.target;

      panel.querySelectorAll('.nav-dd-item').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      panel.querySelectorAll('.nav-dd-group').forEach(function (g) { g.classList.remove('active'); });
      var group = panel.querySelector('.nav-dd-group[data-group="' + target + '"]');
      if (group) group.classList.add('active');
    });
  });

  /* ── Mobile accordion ── */
  document.querySelectorAll('.nav-drawer-accordion').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sub = btn.nextElementSibling;
      var isOpen = btn.classList.contains('open');
      btn.classList.toggle('open', !isOpen);
      if (sub && sub.classList.contains('nav-drawer-sub')) {
        sub.classList.toggle('open', !isOpen);
      }
    });
  });
})();

/* ── Accordion ── */
(function () {
  document.querySelectorAll('.accordion').forEach(function (acc) {
    var mode = acc.dataset.mode || 'single'; // 'single' | 'multi'

    function getItems()    { return Array.from(acc.querySelectorAll('.acc-item:not(.acc-item--disabled)')); }
    function getTriggers() { return getItems().map(function (i) { return i.querySelector('.acc-trigger'); }).filter(Boolean); }

    function open(item) {
      item.classList.add('acc-item--open');
      var btn = item.querySelector('.acc-trigger');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function close(item) {
      item.classList.remove('acc-item--open');
      var btn = item.querySelector('.acc-trigger');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function toggle(item) {
      var isOpen = item.classList.contains('acc-item--open');
      if (mode === 'single' && !isOpen) {
        getItems().forEach(close);
      }
      isOpen ? close(item) : open(item);
    }

    /* Click */
    acc.querySelectorAll('.acc-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.acc-item');
        if (!item || item.classList.contains('acc-item--disabled')) return;
        toggle(item);
      });
    });

    /* Keyboard navigation */
    acc.addEventListener('keydown', function (e) {
      var triggers = getTriggers();
      var idx = triggers.indexOf(document.activeElement);
      if (idx === -1) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); triggers[(idx + 1) % triggers.length].focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); triggers[(idx - 1 + triggers.length) % triggers.length].focus(); }
      if (e.key === 'Home')      { e.preventDefault(); triggers[0].focus(); }
      if (e.key === 'End')       { e.preventDefault(); triggers[triggers.length - 1].focus(); }
    });
  });
})();

/* ── Showcase tab switcher ── */
(function () {
  var tabs = document.querySelectorAll('.sc-tab');
  if (!tabs.length) return;

  function activate(panel) {
    ['sc-tab', 'sc-meta-panel', 'sc-panel', 'sc-subpills'].forEach(function (cls) {
      document.querySelectorAll('.' + cls).forEach(function (el) {
        el.classList.toggle(cls + '--active', el.dataset.panel === panel);
        if (el.role === 'tab') el.setAttribute('aria-selected', el.dataset.panel === panel);
      });
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activate(tab.dataset.panel); });
  });

  document.addEventListener('click', function (e) {
    var spill = e.target.closest('.sc-spill');
    if (!spill) return;
    var group = spill.closest('.sc-subpills');
    if (!group) return;
    group.querySelectorAll('.sc-spill').forEach(function (s) { s.classList.remove('sc-spill--active'); });
    spill.classList.add('sc-spill--active');
  });
})();

/* ── Scroll reveal ── */
(function () {
  if (!window.IntersectionObserver) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('reveal--visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });

  function watch(selector, stagger) {
    document.querySelectorAll(selector).forEach(function (el, i) {
      el.classList.add('reveal');
      if (stagger) el.style.transitionDelay = (i * 72) + 'ms';
      observer.observe(el);
    });
  }

  /* Trust section */
  watch('.trust-heading-row', false);
  watch('.trust-logo-row > *', true);

  /* Showcase */
  watch('.sc-card', false);

  /* Accordion */
  watch('.acc-col-head', false);
  watch('.acc-item', true);

  /* CTA */
  watch('.cta-heading', false);
  watch('.cta-sub',     false);
  watch('.cta-box',     false);

  /* Footer */
  watch('.site-footer', false);
})();

/* ── Contact us popover (global — all pages) ── */
(function () {
  var TOPICS = [
    { emoji: '🚗', label: 'Motor Insurance' },
    { emoji: '✈️', label: 'Travel Insurance' },
    { emoji: '🏢', label: 'Commercial Plans' },
    { emoji: '👥', label: 'Employee Benefits' }
  ];

  var WA_ICON    = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.102 1.523 5.824L.057 23.882a.5.5 0 0 0 .614.667l6.288-1.65A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.073-1.383l-.364-.218-3.768.988.999-3.645-.236-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';
  var EMAIL_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>';

  function buildChips(form) {
    return TOPICS.map(function (t) {
      return '<button class="nav-ctac-chip" data-topic="' + t.label + '" data-form="' + form + '">' + t.emoji + ' ' + t.label + '</button>';
    }).join('');
  }

  var card = document.createElement('div');
  card.id        = 'nav-ctac';
  card.className = 'nav-ctac';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Contact us');

  card.innerHTML = [
    '<button class="nav-ctac-close" id="nav-ctac-close" aria-label="Close">',
    '  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    '</button>',
    '<button class="nav-ctac-back nav-ctac-panel--hidden" id="nav-ctac-back" aria-label="Back">',
    '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    '  Back',
    '</button>',

    /* ── Department selector screen ── */
    '<div class="nav-ctac-dept-screen" id="nav-ctac-dept-screen">',
    '  <p class="nav-ctac-dept-heading">Who would you like to speak to?</p>',
    '  <div class="nav-ctac-dept-options">',
    '    <button class="nav-ctac-dept-btn" data-dept="Sales">',
    '      <span class="nav-ctac-dept-icon">💼</span>',
    '      <div><p class="nav-ctac-dept-name">Sales</p><p class="nav-ctac-dept-desc">Insurance quotes &amp; new plans</p></div>',
    '    </button>',
    '    <button class="nav-ctac-dept-btn" data-dept="Customer Support">',
    '      <span class="nav-ctac-dept-icon">🛟</span>',
    '      <div><p class="nav-ctac-dept-name">Customer Support</p><p class="nav-ctac-dept-desc">Help with existing policies</p></div>',
    '    </button>',
    '    <button class="nav-ctac-dept-btn nav-ctac-dept-btn--claims" data-dept="Claims">',
    '      <span class="nav-ctac-dept-icon">📋</span>',
    '      <div><p class="nav-ctac-dept-name">Claims</p><p class="nav-ctac-dept-desc">Start or track a claim →</p></div>',
    '    </button>',
    '  </div>',
    '</div>',

    '<div class="nav-ctac-tabs nav-ctac-panel--hidden" id="nav-ctac-tabs">',
    '  <button class="nav-ctac-tab nav-ctac-tab--active" data-ctac-tab="wa">WhatsApp</button>',
    '  <button class="nav-ctac-tab" data-ctac-tab="email">Email</button>',
    '</div>',

    '<div class="nav-ctac-header nav-ctac-panel--hidden" id="nav-ctac-header">',
    '  <p class="nav-ctac-heading">Tell me more about</p>',
    '  <p class="nav-ctac-heading-topic" id="nav-ctac-topic-label">...</p>',
    '</div>',

    /* ── WhatsApp form ── */
    '<div class="nav-ctac-form nav-ctac-panel--hidden" id="nav-ctac-form-wa">',
    '  <div class="nav-ctac-field">',
    '    <div class="nav-ctac-chips" id="nav-ctac-chips-wa">' + buildChips('wa') + '</div>',
    '  </div>',
    '  <div class="nav-ctac-field-row">',
    '    <div class="nav-ctac-field">',
    '      <label class="nav-ctac-label" for="nav-ctac-fname">First name</label>',
    '      <input class="nav-ctac-field-input" id="nav-ctac-fname" type="text" placeholder="Sarah" autocomplete="given-name" />',
    '    </div>',
    '    <div class="nav-ctac-field">',
    '      <label class="nav-ctac-label" for="nav-ctac-lname">Last name</label>',
    '      <input class="nav-ctac-field-input" id="nav-ctac-lname" type="text" placeholder="Lim" autocomplete="family-name" />',
    '    </div>',
    '  </div>',
    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-msg">More details</label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-msg" type="text" placeholder="e.g. renewing in June, fleet of 3 cars…" />',
    '  </div>',
    '  <button class="nav-ctac-send" id="nav-ctac-send" data-track="nav_contact_send">',
    '    <span>Send on WhatsApp</span>',
    '    <span class="nav-ctac-rocket">🚀</span>',
    '  </button>',
    '</div>',

    /* ── Email form ── */
    '<div class="nav-ctac-form nav-ctac-panel--hidden" id="nav-ctac-form-email">',
    '  <div class="nav-ctac-field">',
    '    <div class="nav-ctac-chips" id="nav-ctac-chips-email">' + buildChips('email') + '</div>',
    '  </div>',
    '  <div class="nav-ctac-field-row">',
    '    <div class="nav-ctac-field">',
    '      <label class="nav-ctac-label" for="nav-ctac-e-fname">First name</label>',
    '      <input class="nav-ctac-field-input" id="nav-ctac-e-fname" type="text" placeholder="Sarah" autocomplete="given-name" />',
    '    </div>',
    '    <div class="nav-ctac-field">',
    '      <label class="nav-ctac-label" for="nav-ctac-e-lname">Last name</label>',
    '      <input class="nav-ctac-field-input" id="nav-ctac-e-lname" type="text" placeholder="Lim" autocomplete="family-name" />',
    '    </div>',
    '  </div>',
    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-e-company">Company name <span class="nav-ctac-optional">(optional — leave blank for individual)</span></label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-e-company" type="text" placeholder="e.g. Acme Pte Ltd" autocomplete="organization" />',
    '  </div>',
    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-e-email">Email</label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-e-email" type="email" placeholder="e.g. sarah@company.com" autocomplete="email" />',
    '  </div>',
    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-e-phone">Phone <span class="nav-ctac-optional">(include area code if not a Singapore number)</span></label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-e-phone" type="tel" placeholder="91234567" autocomplete="tel" />',
    '  </div>',
    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-e-msg">More details</label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-e-msg" type="text" placeholder="e.g. fleet renewal, 50 employees…" />',
    '  </div>',
    '  <button class="nav-ctac-send" id="nav-ctac-e-send" data-track="nav_email_send">',
    '    <span>Submit</span>',
    '  </button>',
    '</div>',

    '<p class="nav-ctac-wa-note" id="nav-ctac-note-wa">' + WA_ICON + ' We\'ll reply on WhatsApp</p>',
    '<p class="nav-ctac-wa-note nav-ctac-panel--hidden" id="nav-ctac-note-email">' + EMAIL_ICON + ' We\'ll reply via email within 1 business day</p>',

    /* ── Success screen ── */
    '<div class="nav-ctac-success nav-ctac-panel--hidden" id="nav-ctac-success">',
    '  <div class="nav-ctac-success-icon">',
    '    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    '  </div>',
    '  <p class="nav-ctac-success-title">Sent!</p>',
    '  <p class="nav-ctac-success-body" id="nav-ctac-success-body">We\'ve received your message.</p>',
    '  <button class="nav-ctac-send" id="nav-ctac-success-close">Close</button>',
    '</div>'
  ].join('');

  /* ── Backdrop (mobile modal) ── */
  var backdrop = document.createElement('div');
  backdrop.className = 'nav-ctac-backdrop';
  backdrop.addEventListener('click', closeCard);
  document.body.appendChild(backdrop);
  document.body.appendChild(card);

  /* Refs */
  var topicLabel     = document.getElementById('nav-ctac-topic-label');
  var firstNameInput = document.getElementById('nav-ctac-fname');
  var lastNameInput  = document.getElementById('nav-ctac-lname');
  var msgInput       = document.getElementById('nav-ctac-msg');
  var eFirstNameInput = document.getElementById('nav-ctac-e-fname');
  var eLastNameInput  = document.getElementById('nav-ctac-e-lname');
  var eCompanyInput  = document.getElementById('nav-ctac-e-company');
  var eEmailInput    = document.getElementById('nav-ctac-e-email');
  var ePhoneInput    = document.getElementById('nav-ctac-e-phone');
  var eMsgInput      = document.getElementById('nav-ctac-e-msg');
  var selectedTopicWa    = '';
  var selectedTopicEmail = '';
  var selectedDept       = '';
  var activeTab = 'wa';

  var deptScreen = document.getElementById('nav-ctac-dept-screen');
  var MAIN_PANELS = ['nav-ctac-tabs', 'nav-ctac-header', 'nav-ctac-form-wa', 'nav-ctac-form-email', 'nav-ctac-note-wa', 'nav-ctac-note-email'];

  var backBtn = document.getElementById('nav-ctac-back');

  function showDeptScreen() {
    deptScreen.classList.remove('nav-ctac-panel--hidden');
    backBtn.classList.add('nav-ctac-panel--hidden');
    MAIN_PANELS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('nav-ctac-panel--hidden');
    });
  }

  function showMainForm() {
    deptScreen.classList.add('nav-ctac-panel--hidden');
    backBtn.classList.remove('nav-ctac-panel--hidden');
    ['nav-ctac-tabs', 'nav-ctac-header'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('nav-ctac-panel--hidden');
    });
    /* restore active tab panels */
    var showWa = activeTab === 'wa';
    document.getElementById('nav-ctac-form-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
    document.getElementById('nav-ctac-form-email').classList.toggle('nav-ctac-panel--hidden', showWa);
    document.getElementById('nav-ctac-note-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
    document.getElementById('nav-ctac-note-email').classList.toggle('nav-ctac-panel--hidden', showWa);
  }

  /* Dept button clicks */
  card.querySelectorAll('.nav-ctac-dept-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dept = btn.dataset.dept;
      if (dept === 'Claims') { closeCard(); window.location.href = '/claims'; return; }
      selectedDept = dept;
      showMainForm();
      setTimeout(function () { firstNameInput.focus(); }, 50);
    });
  });

  /* Tab switching */
  card.querySelectorAll('.nav-ctac-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeTab = tab.dataset.ctacTab;
      card.querySelectorAll('.nav-ctac-tab').forEach(function (t) { t.classList.remove('nav-ctac-tab--active'); });
      tab.classList.add('nav-ctac-tab--active');

      var showWa = activeTab === 'wa';
      document.getElementById('nav-ctac-form-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
      document.getElementById('nav-ctac-form-email').classList.toggle('nav-ctac-panel--hidden', showWa);
      document.getElementById('nav-ctac-note-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
      document.getElementById('nav-ctac-note-email').classList.toggle('nav-ctac-panel--hidden', showWa);

      var topic = showWa ? selectedTopicWa : selectedTopicEmail;
      topicLabel.textContent = topic || '...';
      topicLabel.style.color = topic ? 'var(--text)' : '';

      setTimeout(function () { (showWa ? firstNameInput : eFirstNameInput).focus(); }, 50);
    });
  });

  /* State */
  function isOpen() { return card.classList.contains('open'); }

  var _activeTrigger = null;

  function isMobile() { return window.innerWidth <= 768; }

  function positionCard(trigger) {
    if (isMobile()) return; /* CSS handles layout on mobile */
    var rect       = trigger.getBoundingClientRect();
    var cardW      = 420;
    var spaceBelow = window.innerHeight - rect.bottom - 12;
    var spaceAbove = rect.top - 12;

    /* Horizontal: right-align to button, clamp left edge */
    var rightEdge = Math.max(window.innerWidth - rect.right, 12);
    if (window.innerWidth - rightEdge - cardW < 12) {
      rightEdge = Math.max(window.innerWidth - cardW - 12, 12);
    }
    card.style.right = rightEdge + 'px';
    card.style.left  = 'auto';

    /* Vertical: open below if enough room, otherwise anchor bottom of card
       to just above the button so it grows upward */
    if (spaceBelow >= 280) {
      card.style.top      = (rect.bottom + 8) + 'px';
      card.style.bottom   = 'auto';
      card.style.maxHeight = spaceBelow + 'px';
    } else {
      card.style.bottom   = (window.innerHeight - rect.top + 8) + 'px';
      card.style.top      = 'auto';
      card.style.maxHeight = spaceAbove + 'px';
    }
  }

  function openCard(trigger, dept) {
    _activeTrigger = trigger || null;
    if (trigger) positionCard(trigger);
    card.classList.add('open');
    if (isMobile()) {
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    if (dept) {
      selectedDept = dept;
      showMainForm();
      setTimeout(function () { firstNameInput.focus(); }, 50);
    } else {
      selectedDept = '';
      showDeptScreen();
    }
  }

  function closeCard() {
    card.classList.remove('open');
    card.style.maxHeight = '';
    _activeTrigger = null;
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* Reposition on scroll so popover follows the trigger button */
  window.addEventListener('scroll', function () {
    if (!isOpen() || !_activeTrigger) return;
    var rect = _activeTrigger.getBoundingClientRect();
    /* Close if trigger has scrolled fully off-screen */
    if (rect.bottom < 0 || rect.top > window.innerHeight) { closeCard(); return; }
    positionCard(_activeTrigger);
  }, { passive: true });

  /* Reposition on resize so popover stays anchored at any viewport width */
  window.addEventListener('resize', function () {
    if (!isOpen() || !_activeTrigger) return;
    positionCard(_activeTrigger);
  }, { passive: true });

  var PANELS = ['nav-ctac-tabs', 'nav-ctac-header', 'nav-ctac-form-wa', 'nav-ctac-form-email', 'nav-ctac-note-wa', 'nav-ctac-note-email'];

  function showSuccess(bodyText) {
    PANELS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('nav-ctac-panel--hidden');
    });
    document.getElementById('nav-ctac-close').classList.add('nav-ctac-panel--hidden');
    document.getElementById('nav-ctac-success-body').textContent = bodyText || 'We\'ve received your message.';
    document.getElementById('nav-ctac-success').classList.remove('nav-ctac-panel--hidden');
  }

  function hideSuccess() {
    document.getElementById('nav-ctac-success').classList.add('nav-ctac-panel--hidden');
    document.getElementById('nav-ctac-close').classList.remove('nav-ctac-panel--hidden');
    var showWa = activeTab === 'wa';
    document.getElementById('nav-ctac-tabs').classList.remove('nav-ctac-panel--hidden');
    document.getElementById('nav-ctac-header').classList.remove('nav-ctac-panel--hidden');
    document.getElementById('nav-ctac-form-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
    document.getElementById('nav-ctac-form-email').classList.toggle('nav-ctac-panel--hidden', showWa);
    document.getElementById('nav-ctac-note-wa').classList.toggle('nav-ctac-panel--hidden', !showWa);
    document.getElementById('nav-ctac-note-email').classList.toggle('nav-ctac-panel--hidden', showWa);
  }

  function resetForm() {
    [firstNameInput, lastNameInput, msgInput, eFirstNameInput, eLastNameInput, eCompanyInput, eEmailInput, ePhoneInput, eMsgInput].forEach(function (el) { el.value = ''; el.classList.remove('nav-ctac-error'); });
    selectedTopicWa    = '';
    selectedTopicEmail = '';
    topicLabel.textContent = '...';
    topicLabel.style.color = '';
    card.querySelectorAll('.nav-ctac-chip').forEach(function (c) { c.classList.remove('active'); });
  }

  /* Triggers */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-track="nav_contact_us"], [data-track="drawer_contact_us"]');
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen()) { closeCard(); } else { openCard(trigger); }
      return;
    }
    if (isOpen() && !card.contains(e.target)) closeCard();
  });

  document.getElementById('nav-ctac-close').addEventListener('click', function (e) {
    e.stopPropagation();
    closeCard();
  });

  backBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    showDeptScreen();
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });

  /* Chip selection */
  card.querySelectorAll('.nav-ctac-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var form = chip.dataset.form;
      card.querySelectorAll('.nav-ctac-chip[data-form="' + form + '"]').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      if (form === 'wa') {
        selectedTopicWa = chip.dataset.topic;
        msgInput.focus();
      } else {
        selectedTopicEmail = chip.dataset.topic;
        eMsgInput.focus();
      }
      topicLabel.textContent = chip.dataset.topic;
      topicLabel.style.color = 'var(--text)';
    });
  });

  /* WA send */
  function sendWaMessage() {
    var firstName = firstNameInput.value.trim();
    var lastName  = lastNameInput.value.trim();
    var extra     = msgInput.value.trim();

    if (!firstName) { firstNameInput.focus(); firstNameInput.classList.add('nav-ctac-error'); return; }
    if (!lastName)  { lastNameInput.focus();  lastNameInput.classList.add('nav-ctac-error');  return; }
    if (!selectedTopicWa) {
      document.getElementById('nav-ctac-chips-wa').classList.add('nav-ctac-chips-error');
      setTimeout(function () { document.getElementById('nav-ctac-chips-wa').classList.remove('nav-ctac-chips-error'); }, 600);
      return;
    }
    if (!extra) { msgInput.focus(); msgInput.classList.add('nav-ctac-error'); return; }

    firstNameInput.classList.remove('nav-ctac-error');
    lastNameInput.classList.remove('nav-ctac-error');
    msgInput.classList.remove('nav-ctac-error');

    var fullName = firstName + ' ' + lastName;
    var msg = 'Hi, I\'m ' + fullName + '. I want to know more about ' + selectedTopicWa + '. ' + extra;

    if (typeof window.trsCaptureLead === 'function') window.trsCaptureLead({
      first_name:   firstName,
      last_name:    lastName,
      department:   selectedDept  || null,
      contact_type: 'Individual',
      topic:        selectedTopicWa,
      details:      extra,
      message:      msg
    }, 'whatsapp_click');
    window.open('https://wa.me/6589386813?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    resetForm();
    showSuccess('Your message is on its way!');
  }

  /* Email send */
  function sendEmailEnquiry() {
    var eFirstName = eFirstNameInput.value.trim();
    var eLastName  = eLastNameInput.value.trim();
    var eCompany   = eCompanyInput.value.trim();
    var eEmail     = eEmailInput.value.trim();
    var ePhone     = ePhoneInput.value.trim();
    var eMsg       = eMsgInput.value.trim();
    var ok = true;

    if (!eFirstName)                      { eFirstNameInput.classList.add('nav-ctac-error'); ok = false; }
    if (!eLastName)                       { eLastNameInput.classList.add('nav-ctac-error');  ok = false; }
    if (!eEmail || !eEmail.includes('@')) { eEmailInput.classList.add('nav-ctac-error');     ok = false; }
    if (!selectedTopicEmail) {
      document.getElementById('nav-ctac-chips-email').classList.add('nav-ctac-chips-error');
      setTimeout(function () { document.getElementById('nav-ctac-chips-email').classList.remove('nav-ctac-chips-error'); }, 600);
      ok = false;
    }
    if (!eMsg) { eMsgInput.classList.add('nav-ctac-error'); ok = false; }
    if (!ok) return;

    if (typeof window.trsCaptureLead === 'function') window.trsCaptureLead({
      first_name:   eFirstName,
      last_name:    eLastName,
      email:        eEmail,
      phone:        ePhone    || null,
      company:      eCompany  || null,
      department:   selectedDept  || null,
      contact_type: eCompany  ? 'Business' : 'Individual',
      topic:        selectedTopicEmail,
      details:      eMsg,
      message:      null
    }, 'website_form');
    resetForm();
    showSuccess('Your enquiry has been received.');
  }

  /* Global hook — pre-fill More details and open popover */
  window.trsOpenContactPopover = function (msg, trigger, dept) {
    if (msg) {
      msgInput.value  = msg;
      eMsgInput.value = msg;
    }
    openCard(trigger || null, dept || null);
  };

  document.getElementById('nav-ctac-send').addEventListener('click', sendWaMessage);
  document.getElementById('nav-ctac-e-send').addEventListener('click', sendEmailEnquiry);
  document.getElementById('nav-ctac-success-close').addEventListener('click', function () {
    hideSuccess();
    closeCard();
  });

  [firstNameInput, lastNameInput, msgInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendWaMessage(); } });
    el.addEventListener('input',   function ()  { el.classList.remove('nav-ctac-error'); });
  });

  [eFirstNameInput, eLastNameInput, eCompanyInput, eEmailInput, ePhoneInput, eMsgInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendEmailEnquiry(); } });
    el.addEventListener('input',   function ()  { el.classList.remove('nav-ctac-error'); });
  });
})();

/* ── Nav dark mode — over dark sections ── */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;

  var NAV_BOTTOM = 80; /* px — height of the pill */

  function checkDark() {
    var dark = false;
    document.querySelectorAll('[data-dark-section]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top <= NAV_BOTTOM && r.bottom >= 0) { dark = true; }
    });
    nav.classList.toggle('nav--dark', dark);
  }

  window.addEventListener('scroll', checkDark, { passive: true });
  window.addEventListener('resize', checkDark, { passive: true });
  checkDark();
})();
