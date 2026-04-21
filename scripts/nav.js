(function () {
  var nav      = document.querySelector('.nav');
  var hamburger = document.querySelector('.nav-hamburger');
  var overlay  = document.querySelector('.nav-drawer-overlay');
  var closeBtn = document.querySelector('.nav-drawer-close');

  /* ── Scroll → pill transform ── */
  var THRESHOLD = 60;
  function onScroll() {
    if (window.scrollY > THRESHOLD) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run once on load

  /* ── Mobile drawer ── */
  function open()  { document.body.classList.add('drawer-open'); }
  function close() { document.body.classList.remove('drawer-open'); }

  if (hamburger) hamburger.addEventListener('click', open);
  if (overlay)   overlay.addEventListener('click', close);
  if (closeBtn)  closeBtn.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
