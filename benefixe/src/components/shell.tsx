/* The header, drawer and footer of public/site.html, for the server-rendered blog pages. Same
   markup and the same stylesheet (/site.css), so the two parts of the site look identical.
   Section links go back to the one-page home by hash. */
const CONTACT = "mailto:hello@benefixe.com";

const links = [
  ["/#insider-pass", "Insider Pass"],
  ["/#group-benefits", "Group benefits"],
  ["/#about", "About"],
  ["/#faq", "FAQ"],
  ["/blogs", "Resources"],
] as const;

export function Header() {
  return (
    <>
      <header className="nav" id="nav">
        <div className="nav-in">
          <button className="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span /><span /><span /></button>
          <a className="wordmark" href="/" aria-label="Benefixe home">benefixe</a>
          <nav className="nav-links" aria-label="Primary">
            {links.map(([href, label]) => <a key={href} href={href} className={href === "/blogs" ? "active" : undefined}>{label}</a>)}
          </nav>
          <a className="btn btn-orange btn-sm" href={CONTACT}>Get in touch</a>
        </div>
      </header>
      <div className="drawer" id="drawer" aria-hidden="true">
        <div className="drawer-bg" data-close />
        <div className="drawer-panel" role="dialog" aria-label="Menu">
          <div className="drawer-top"><span className="wordmark">benefixe</span><button type="button" className="drawer-x" data-close aria-label="Close menu">✕</button></div>
          {links.map(([href, label]) => <a key={href} className="link" href={href} data-close>{label}</a>)}
          <a className="btn btn-orange" href={CONTACT}>Get in touch</a>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `(function(){var d=document.getElementById('drawer'),b=document.getElementById('burger');if(!d||!b)return;function set(o){d.classList.toggle('open',o);d.setAttribute('aria-hidden',String(!o));b.setAttribute('aria-expanded',String(o));document.body.style.overflow=o?'hidden':''}b.addEventListener('click',function(){set(true)});d.querySelectorAll('[data-close]').forEach(function(x){x.addEventListener('click',function(){set(false)})});addEventListener('keydown',function(e){if(e.key==='Escape')set(false)})})();` }} />
    </>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-cta">
          <div><b>Review your group benefits</b><span>A 20-minute call, then quotes from 5 insurers.</span></div>
          <a className="btn btn-ink orange-text" href={CONTACT}>Get in touch</a>
        </div>
        <div className="foot-grid">
          <div><a className="wordmark" href="/">benefixe</a><p>Group insurance and the Insider Pass for Singapore companies. Operated by Trade Risk Solutions Pte Ltd.</p></div>
          <nav aria-label="Benefixe"><strong>Benefixe</strong><a href="/#insider-pass">Insider Pass</a><a href="/#group-benefits">Group benefits</a><a href="/#about">About</a></nav>
          <nav aria-label="Help"><strong>Help</strong><a href="/#faq">FAQ</a><a href="/blogs">Resources</a><a href={CONTACT}>Get in touch</a></nav>
          <nav aria-label="Contact"><strong>Contact</strong><span>hello@benefixe.com</span></nav>
          <nav aria-label="Legal"><strong>Legal</strong><a href="/">Privacy policy</a><a href="/">Terms</a></nav>
        </div>
        <div className="foot-bottom"><span>© {new Date().getFullYear()} Benefixe. Singapore.</span><span>Cover limits are the highest plan limits in insurer brochures and differ by plan.</span></div>
      </div>
    </footer>
  );
}
