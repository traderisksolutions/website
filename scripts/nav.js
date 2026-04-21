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
