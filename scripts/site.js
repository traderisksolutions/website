/* TRS site behaviour (24 Oct 2026): nav menus and drawer, rotating headline verb, industries carousel.
   Loaded on every page after nav.js. Each block checks for its elements first. */
(function () {
  var REV = '.s-sec > .s-w > .s-h2, .s-sec > .s-w > .s-sub, .s-sec > .s-w > .s-eb, .s-vn > div, .s-logos img, .s-wwd-pic, .s-wwd-l > div, .s-outs > *, .s-north > *, .s-cov > div, .s-ic > *, .s-steps > *, .s-rel > a, .s-ab > p, .s-cpl, .s-ablk, .s-cr-vp, .s-close > *';
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var els = Array.prototype.slice.call(document.querySelectorAll(REV));
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('s-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el, k) {
      el.classList.add('s-rv');
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add('s-in'); else { el.style.transitionDelay = (k % 4) * 70 + 'ms'; io.observe(el); }
    });
    document.documentElement.classList.add('s-js');
  }

  var tn = document.querySelector('.tn');
  if (tn) {
    var onScroll = function () { tn.classList.toggle('tn-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    document.querySelectorAll('.tn-dd').forEach(function (dd) {
      var trig = dd.querySelector('.tn-trig');
      trig.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !dd.classList.contains('open');
        document.querySelectorAll('.tn-dd.open').forEach(function (x) { x.classList.remove('open'); x.querySelector('.tn-trig').setAttribute('aria-expanded', 'false'); });
        dd.classList.toggle('open', open); trig.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.tn-dd')) document.querySelectorAll('.tn-dd.open').forEach(function (x) { x.classList.remove('open'); x.querySelector('.tn-trig').setAttribute('aria-expanded', 'false'); });
    });
    var burger = document.querySelector('.tn-burger');
    if (burger) burger.addEventListener('click', function () {
      var open = !document.body.classList.contains('tn-open');
      document.body.classList.toggle('tn-open', open); burger.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.body.classList.remove('tn-open');
      document.querySelectorAll('.tn-dd.open').forEach(function (x) { x.classList.remove('open'); });
    });
  }

  var rot = document.querySelector('.s-rot[data-rot]');
  if (rot && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var words = rot.getAttribute('data-rot').split('|'), i = 0;
    setInterval(function () {
      rot.classList.add('s-fade');
      setTimeout(function () { i = (i + 1) % words.length; rot.textContent = words[i]; rot.classList.remove('s-fade'); }, 350);
    }, 2400);
  }

  var tr = document.querySelector('.s-cr-tr');
  if (tr) {
    var cards = tr.querySelectorAll('.s-cr-c'), dots = document.querySelectorAll('.s-cr-dots button'), cur = 2;
    var go = function (n) {
      cur = (n + cards.length) % cards.length;
      cards.forEach(function (c, j) { c.classList.toggle('on', j === cur); });
      dots.forEach(function (d, j) { d.classList.toggle('on', j === cur); d.setAttribute('aria-current', j === cur ? 'true' : 'false'); });
      var c = cards[cur], vp = tr.parentElement;
      tr.style.transform = 'translateX(' + (vp.clientWidth / 2 - (c.offsetLeft + c.offsetWidth / 2)) + 'px)';
    };
    document.querySelectorAll('[data-cr]').forEach(function (b) { b.addEventListener('click', function () { go(cur + Number(b.getAttribute('data-cr'))); }); });
    dots.forEach(function (d, j) { d.addEventListener('click', function () { go(j); }); });
    cards.forEach(function (c, j) { c.querySelector('.s-cr-img').addEventListener('click', function (e) { if (j !== cur) { e.preventDefault(); go(j); } }); });
    window.addEventListener('resize', function () { go(cur); });
    go(cur);
  }
})();
