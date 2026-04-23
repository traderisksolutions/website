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

/* ── Nav dark mode — over dark sections ── */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav || !window.IntersectionObserver) return;

  var darkCount = 0;

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      darkCount += entry.isIntersecting ? 1 : -1;
      nav.classList.toggle('nav--dark', darkCount > 0);
    });
  }, {
    /* rootMargin clips to a thin horizontal band at the nav height */
    rootMargin: '-60px 0px -85% 0px'
  });

  document.querySelectorAll('[data-dark-section]').forEach(function (el) {
    obs.observe(el);
  });
})();
