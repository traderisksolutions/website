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

  var WA_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.118.554 4.102 1.523 5.824L.057 23.882a.5.5 0 0 0 .614.667l6.288-1.65A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.94 9.94 0 0 1-5.073-1.383l-.364-.218-3.768.988.999-3.645-.236-.374A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';

  /* Build card HTML */
  var card = document.createElement('div');
  card.id        = 'nav-ctac';
  card.className = 'nav-ctac';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Contact us');

  var chipsHtml = TOPICS.map(function (t) {
    return '<button class="nav-ctac-chip" data-topic="' + t.label + '">' + t.emoji + ' ' + t.label + '</button>';
  }).join('');

  card.innerHTML = [
    '<button class="nav-ctac-close" id="nav-ctac-close" aria-label="Close">',
    '  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    '</button>',

    '<div class="nav-ctac-header">',
    '  <p class="nav-ctac-heading">Tell me more about</p>',
    '  <p class="nav-ctac-heading-topic" id="nav-ctac-topic-label">...</p>',
    '</div>',

    '<div class="nav-ctac-form">',

    '  <div class="nav-ctac-field">',
    '    <div class="nav-ctac-chips">' + chipsHtml + '</div>',
    '  </div>',

    '  <div class="nav-ctac-field">',
    '    <label class="nav-ctac-label" for="nav-ctac-name">Your name</label>',
    '    <input class="nav-ctac-field-input" id="nav-ctac-name" type="text" placeholder="e.g. Sarah Lim" autocomplete="name" />',
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

    '<p class="nav-ctac-wa-note">' + WA_ICON + ' We\'ll reply on WhatsApp</p>'
  ].join('');

  document.body.appendChild(card);

  /* Refs */
  var topicLabel  = document.getElementById('nav-ctac-topic-label');
  var nameInput   = document.getElementById('nav-ctac-name');
  var msgInput    = document.getElementById('nav-ctac-msg');
  var selectedTopic = '';

  /* State */
  function isOpen() { return card.classList.contains('open'); }

  function positionCard(trigger) {
    var rect  = trigger.getBoundingClientRect();
    card.style.top   = (rect.bottom + 8) + 'px';
    card.style.right = Math.max(window.innerWidth - rect.right, 12) + 'px';
    card.style.left  = 'auto';
  }

  function openCard(trigger) {
    if (trigger) positionCard(trigger);
    card.classList.add('open');
    setTimeout(function () { nameInput.focus(); }, 50);
  }

  function closeCard() {
    card.classList.remove('open');
  }

  function resetForm() {
    nameInput.value   = '';
    msgInput.value    = '';
    selectedTopic     = '';
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

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });

  /* Chip selection — updates heading + marks active */
  card.querySelectorAll('.nav-ctac-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      card.querySelectorAll('.nav-ctac-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      selectedTopic = chip.dataset.topic;
      topicLabel.textContent = selectedTopic;
      topicLabel.style.color = 'var(--text)';
      msgInput.focus();
    });
  });

  /* Send */
  function sendMessage() {
    var name  = nameInput.value.trim();
    var extra = msgInput.value.trim();

    if (!name)  { nameInput.focus();  nameInput.classList.add('nav-ctac-error');  return; }
    if (!selectedTopic) {
      card.querySelector('.nav-ctac-chips').classList.add('nav-ctac-chips-error');
      setTimeout(function () { card.querySelector('.nav-ctac-chips').classList.remove('nav-ctac-chips-error'); }, 600);
      return;
    }
    if (!extra) { msgInput.focus();   msgInput.classList.add('nav-ctac-error');   return; }

    nameInput.classList.remove('nav-ctac-error');
    msgInput.classList.remove('nav-ctac-error');

    var parts = ['Hi, I\'m ' + name + '.', 'I want to know more about ' + selectedTopic + '.', extra];
    var msg = parts.join(' ');

    if (typeof window.trsCaptureLead === 'function') {
      window.trsCaptureLead(msg, 'website_form');
    }

    window.open('https://wa.me/6562380888?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    resetForm();
    closeCard();
  }

  document.getElementById('nav-ctac-send').addEventListener('click', sendMessage);
  [nameInput, msgInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
  });
  nameInput.addEventListener('input', function () { nameInput.classList.remove('nav-ctac-error'); });
  msgInput.addEventListener('input',  function () { msgInput.classList.remove('nav-ctac-error'); });
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
