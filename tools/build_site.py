"""Builds the TRS site pages from the copy in the archived site (tag archive/site-2026-10-24).

Run from the repo root:  python3 tools/build_site.py
Rewrites: index.html, about.html, every product page (/commercial, /employees, /personal,
/consumers) and every solution page (/solutions/*). Each page keeps its original <head>
(title, description, canonical, Open Graph) with the new fonts and styles/site.css added.
Nav and footer come from scripts/nav.js; page behaviour from scripts/site.js.
"""
import html, re, subprocess, json, os

ARCHIVE = 'archive/site-2026-10-24'
WA = 'https://wa.me/6589386813?text=' + 'Hi%20TRS%2C%20I%27d%20like%20to%20talk%20to%20a%20broker.'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
         '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
         '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Archivo:wdth,wght@62..125,400..900&family=Zhi+Mang+Xing&display=swap" />')


def orig(path):
    return subprocess.run(['git', 'show', f'{ARCHIVE}:{path}'], capture_output=True, text=True, check=True).stdout


def clean(x):
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', x))).strip()


def e(x):
    return html.escape(x, quote=False)


def head_of(path, extra=''):
    s = orig(path)
    h = re.search(r'<head>(.*?)</head>', s, re.S).group(1)
    h = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', h)
    h = re.sub(r'\s*<link rel="preload" href="https://fonts\.googleapis\.com[^>]*>', '', h)
    h = re.sub(r'\s*<noscript><link rel="stylesheet" href="https://fonts\.googleapis\.com[^<]*</noscript>', '', h)
    h = re.sub(r'\s*<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', '', h)
    h = re.sub(r'\s*<link rel="stylesheet" href="/styles/(?!main\.css)[^"]+" />', '', h)
    if '/styles/main.css' not in h:
        h += '\n  <link rel="stylesheet" href="/styles/main.css" />'
    h = h.replace('<link rel="stylesheet" href="/styles/main.css" />',
                  FONTS + '\n  <link rel="stylesheet" href="/styles/main.css" />\n  <link rel="stylesheet" href="/styles/site.css" />', 1)
    return '<head>' + h + extra + '\n</head>'


def page(path, body):
    return ('<!DOCTYPE html>\n<html lang="en">\n' + head_of(path) + '\n<body class="s-site">\n  <div id="nav-root"></div>\n'
            + body + '\n  <div id="footer-root"></div>\n'
            '  <script src="/scripts/product-taxonomy.js"></script>\n'
            '  <script src="/scripts/nav.js"></script>\n'
            '  <script src="/scripts/analytics.js" defer></script>\n'
            '  <script src="/scripts/site.js" defer></script>\n</body>\n</html>\n')


ARROW = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12 12 4M6 4h6v6"/></svg>'


def ctas():
    return ('<div class="s-acts"><a href="#" class="s-btn s-o" data-ctac-modal data-track="page_get_quote">Get a quote</a>'
            f'<a class="s-btn s-p" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker {ARROW}</a></div>')


def close_band():
    return ('<section class="s-sec s-tint"><div class="s-w s-close"><p class="s-pill">Next step</p><h2 class="s-h2">Find out what the right coverage looks like for you.</h2>'
            '<p class="s-sub">A broker reads your current schedule against your operations and replies within two working days.</p>'
            f'<div class="s-acts"><a class="s-btn s-p" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker {ARROW}</a>'
            '<a href="#" class="s-btn s-o" data-ctac-modal data-track="page_get_quote">Get a quote</a></div></div></section>')


# ---------------------------------------------------------------- data
SOL = {
    'logistics': ('Logistics and freight', 'logistics.jpg', 'Keep cargo moving through every handover, cover the fleet and the warehouse, and settle claims before the next shipment.'),
    'energy': ('Energy and chemicals', 'energy.jpg', 'Secure capacity for high-consequence sites, contain environmental liability, and keep income insured through every shutdown.'),
    'wholesale': ('Wholesale and distribution', 'wholesale-trade.jpg', 'Protect stock in the warehouse and on the road, and sell on credit terms without carrying the bad debt.'),
    'financial-services': ('Financial services', 'finance.jpg', 'Meet MAS requirements, protect directors and the fund, and answer investors with the cover already in place.'),
    'built-environment': ('Built environment', 'construction.jpg', 'Win tenders with the right cover in hand, protect every project from groundbreaking to handover, and keep workers compliant.'),
    'healthcare': ('Healthcare and life sciences', 'healthcare.jpg', 'Run clinical trials with confidence, protect practitioners against malpractice claims, and offer benefits that hire.'),
    'manufacturing': ('Manufacturing', 'electronics.jpg', 'Keep the line running after a breakdown, defend against product liability, and recover lost income while the plant is down.'),
    'professional-services': ('Professional services', 'professional-services.jpg', 'Protect the advice you give, the directors who give it, and the client data you hold.'),
    'tech-media-startups': ('Tech, media and start-ups', 'electronics.jpg', 'Raise with D&O in place, recover fast from a breach, and scale cover from Series A to IPO.'),
}
SOL_ORDER = ['logistics', 'energy', 'wholesale', 'financial-services', 'built-environment', 'healthcare', 'manufacturing', 'professional-services', 'tech-media-startups']
GROUP = {
    'commercial/property': ('Business cover', 'Property and business', 'Commercial property insurance'),
    'commercial/revenue': ('Business cover', 'Property and business', 'Business interruption insurance'),
    'commercial/car': ('Business cover', 'Engineering and construction', "Contractors' all risks insurance"),
    'commercial/equipment': ('Business cover', 'Engineering and construction', 'Machinery breakdown insurance'),
    'commercial/electronic-equipment': ('Business cover', 'Engineering and construction', 'Electronic equipment insurance'),
    'commercial/specialized': ('Business cover', 'Engineering and construction', 'Specialised asset insurance'),
    'commercial/motor': ('Business cover', 'Motor, marine and logistics', 'Commercial fleet and motor insurance'),
    'commercial/inventory': ('Business cover', 'Motor, marine and logistics', 'Marine cargo insurance'),
    'commercial/stock-throughput': ('Business cover', 'Motor, marine and logistics', 'Stock throughput insurance'),
    'commercial/inland-transit': ('Business cover', 'Motor, marine and logistics', 'Inland transit insurance'),
    'commercial/financial-assets': ('Business cover', 'Trade credit and bonds', 'Trade credit insurance'),
    'commercial/surety-bonds': ('Business cover', 'Trade credit and bonds', 'Surety bonds'),
    'commercial/core-liability': ('Business cover', 'Liability', 'Public and products liability insurance'),
    'commercial/professional': ('Business cover', 'Liability', 'Professional indemnity insurance'),
    'commercial/dao': ('Business cover', 'Liability', 'Directors and officers insurance'),
    'commercial/imi': ('Business cover', 'Liability', 'Investment management insurance'),
    'commercial/medical-malpractice': ('Business cover', 'Liability', 'Medical malpractice insurance'),
    'commercial/cyber': ('Business cover', 'Cyber', 'Cyber insurance'),
    'commercial/workmen': ('Workforce and personal', 'Workforce', 'Work injury compensation (WICA)'),
    'commercial/foreign-worker': ('Workforce and personal', 'Workforce', 'Foreign worker medical insurance'),
    'commercial/foreign-worker-bond': ('Workforce and personal', 'Workforce', 'Foreign worker security bond'),
    'employees/medical': ('Workforce and personal', 'Employee benefits', 'Group medical insurance'),
    'employees/benefits': ('Workforce and personal', 'Employee benefits', 'Employee benefits insurance'),
    'employees/group-travel': ('Workforce and personal', 'Employee benefits', 'Group business travel insurance'),
    'employees/keyman': ('Workforce and personal', 'Employee benefits', 'Keyman insurance'),
    'employees/dao': ('Workforce and personal', 'Employee benefits', 'Executive D&O insurance'),
    'personal/fire': ('Workforce and personal', 'Personal', 'Fire insurance'),
    'personal/home-contents': ('Workforce and personal', 'Personal', 'Home contents insurance'),
    'personal/maid': ('Workforce and personal', 'Personal', 'Maid insurance'),
    'personal/personal-accident': ('Workforce and personal', 'Personal', 'Personal accident insurance'),
    'consumers/motor': ('Workforce and personal', 'Personal', 'Motor insurance'),
    'consumers/travel': ('Workforce and personal', 'Personal', 'Travel insurance'),
}
FOR = {
    'commercial/property': ['manufacturing', 'energy', 'wholesale', 'built-environment'],
    'commercial/revenue': ['manufacturing', 'energy', 'logistics', 'wholesale'],
    'commercial/car': ['built-environment', 'energy'],
    'commercial/equipment': ['manufacturing', 'energy', 'built-environment'],
    'commercial/electronic-equipment': ['manufacturing', 'tech-media-startups', 'healthcare'],
    'commercial/specialized': ['energy', 'manufacturing'],
    'commercial/motor': ['logistics', 'built-environment', 'wholesale'],
    'commercial/inventory': ['logistics', 'wholesale', 'manufacturing'],
    'commercial/stock-throughput': ['wholesale', 'logistics', 'manufacturing'],
    'commercial/inland-transit': ['logistics', 'wholesale'],
    'commercial/financial-assets': ['wholesale', 'manufacturing', 'logistics'],
    'commercial/surety-bonds': ['built-environment', 'energy'],
    'commercial/core-liability': ['manufacturing', 'wholesale', 'energy', 'built-environment', 'logistics'],
    'commercial/professional': ['professional-services', 'tech-media-startups', 'financial-services', 'built-environment'],
    'commercial/dao': ['financial-services', 'tech-media-startups', 'professional-services'],
    'commercial/imi': ['financial-services'],
    'commercial/medical-malpractice': ['healthcare'],
    'commercial/cyber': ['financial-services', 'professional-services', 'tech-media-startups', 'healthcare'],
    'commercial/workmen': ['built-environment', 'manufacturing', 'logistics', 'energy', 'wholesale'],
    'commercial/foreign-worker': ['built-environment', 'manufacturing', 'logistics'],
    'commercial/foreign-worker-bond': ['built-environment', 'manufacturing', 'logistics'],
    'employees/medical': ['professional-services', 'financial-services', 'tech-media-startups', 'healthcare'],
    'employees/benefits': ['professional-services', 'financial-services', 'tech-media-startups', 'manufacturing'],
    'employees/group-travel': ['professional-services', 'financial-services', 'tech-media-startups'],
    'employees/keyman': ['tech-media-startups', 'professional-services', 'financial-services'],
    'employees/dao': ['financial-services', 'tech-media-startups'],
}


def extract(path):
    s = orig(path)
    g = lambda c: [clean(x) for x in re.findall(r'class="%s"[^>]*>(.*?)</(?:p|h\d|div|span)>' % c, s, re.S)]
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    d = g('ph-desc')
    return dict(lede=clean(h1.group(1)) if h1 else '', desc=d[0] if d else '', items=list(zip(g('ph-card-title'), g('ph-card-body'))))


PROD = {k: dict(extract(k + '/index.html'), path=k) for k in GROUP}
SOLD = {k: extract('solutions/%s/index.html' % k) for k in SOL}


def lc(n):
    return ' '.join(w if re.search(r'[A-Z].*[A-Z]', w) else w.lower() for w in n.split(' '))


def crumb(parts):
    return '<nav class="s-crumb" aria-label="Breadcrumb">' + '<span>/</span>'.join(parts) + '</nav>'


def hero(crumbs, name, lede, desc):
    return (f'<section class="s-w">{crumbs}<div class="s-hero2"><div><h1 class="s-h1">{e(name)}</h1><p class="s-lede">{e(lede)}</p></div>'
            f'<div class="s-hr"><p>{e(desc)}</p>{ctas()}</div></div></section>')


def cov(items, eyebrow, heading):
    return (f'<section class="s-sec s-dark"><div class="s-w"><p class="s-pill">{e(eyebrow)}</p><h2 class="s-h2">{e(heading)}</h2><div class="s-cov">'
            + ''.join(f'<div><h3>{e(t)}</h3><p>{e(b)}</p></div>' for t, b in items) + '</div></div></section>')


def card(slug, line=True):
    n, img, l = SOL[slug]
    return (f'<a class="s-icc" href="/solutions/{slug}/"><span class="s-im"><img src="/images/industries/{img}" alt="" loading="lazy"><span class="s-tg">{e(n)}</span></span>'
            + (f'<span class="s-icl">{e(l)}</span>' if line else '') + '<span class="s-more">See more &rarr;</span></a>')


def rows(paths):
    return '<div class="s-rel">' + ''.join(
        f'<a href="/{p}/"><span><b>{e(GROUP[p][2])}</b><span>{e(PROD[p]["lede"])}</span></span>{ARROW}</a>' for p in paths) + '</div>'


def product(p):
    g, sub, name = GROUP[p]
    d = PROD[p]
    b = hero(crumb([f'<a href="/#services">Products</a>', e(g), e(sub)]), name, d['lede'], d['desc'])
    b += cov(d['items'], 'Coverage', f'What {lc(name)} covers')
    if sub != 'Personal' and FOR.get(p):
        b += ('<section class="s-sec"><div class="s-w"><p class="s-pill">Deep domain expertise</p><h2 class="s-h2">Placed for the businesses that carry this risk</h2>'
              '<div class="s-ic">' + ''.join(card(s) for s in FOR[p]) + '</div></div></section>')
    b += ('<section class="s-sec s-tint"><div class="s-w"><p class="s-pill">How TRS places it</p><h2 class="s-h2">From the first review to every claim after it</h2><div class="s-steps">'
          '<div><i>1</i><h3>Review</h3><p>A named broker reads the current policy against how the business runs today and lists the gaps.</p></div>'
          '<div><i>2</i><h3>Market</h3><p>TRS takes the risk to the insurers with appetite for it and sets the quotes side by side: premium, deductibles, exclusions.</p></div>'
          '<div><i>3</i><h3>Manage</h3><p>The same team handles mid-term changes, renewals and the claim, from first notice to settlement.</p></div></div></div></section>')
    sibs = [x for x in GROUP if GROUP[x][1] == sub and x != p]
    if sibs:
        b += f'<section class="s-sec"><div class="s-w"><p class="s-pill">{e(sub)}</p><h2 class="s-h2">More in {e(sub.lower())}</h2>{rows(sibs)}</div></section>'
    return b + close_band()


def solution(slug):
    n, img, line = SOL[slug]
    d = SOLD[slug]
    b = hero(crumb(['<a href="/#solutions">Solutions</a>', e(n)]), n, d['lede'], d['desc'])
    b += f'<div class="s-w"><div class="s-wide"><img src="/images/industries/{img}" alt="{e(n)}"></div></div>'
    b += '<div style="height:104px"></div>' + cov(d['items'], 'Key exposures', line)
    uses = [p for p in GROUP if slug in FOR.get(p, [])]
    if uses:
        b += f'<section class="s-sec"><div class="s-w"><p class="s-pill">Products</p><h2 class="s-h2">The cover {e(n.lower())} businesses buy</h2>{rows(uses)}</div></section>'
    b += ('<section class="s-sec s-tint"><div class="s-w"><p class="s-pill">Proven in action</p><h2 class="s-h2">Turning great experiences into impactful savings</h2><div class="s-outs">'
          '<div class="s-oc"><span>Singapore-licensed insurers TRS places with</span><b>18</b></div>'
          '<div class="s-oc"><span>Years placing corporate programmes</span><b>15+</b></div>'
          '<div class="s-oc"><span>Clients served</span><b>250+</b></div></div></div></section>')
    b += ('<section class="s-sec"><div class="s-w"><p class="s-pill">Deep domain expertise</p><h2 class="s-h2">Protecting businesses across industries</h2><div class="s-ic">'
          + ''.join(card(x, False) for x in SOL_ORDER if x != slug) + '</div></div></section>')
    return b + close_band()


# ---------------------------------------------------------------- home
LOGOS = [('zijin', 'Zijin Mining', 40), ('nintendo', 'Nintendo', 38), ('cccc', 'China Communications Construction', 46), ('crcc', 'China Railway Construction', 56),
         ('mcc', 'Metallurgical Corporation of China', 34), ('zpmc', 'ZPMC', 38), ('ctg', 'China Three Gorges', 32), ('bucg', 'Beijing Urban Construction Group', 40),
         ('jgc', 'JGC', 42), ('keller', 'Keller', 34), ('hello', 'Hello Inc', 42), ('anywheel', 'Anywheel', 30), ('healthway', 'Healthway Medical', 46),
         ('soilbuild', 'Soilbuild', 58), ('samwoh', 'Samwoh', 52), ('datalec', 'Datalec', 34), ('celavi', 'CÉ LA VI', 24), ('aas', 'Automobile Association of Singapore', 44)]
SERVICES = [
    ('Property and business', 'commercial/property', 'Physical assets against damage, loss and business interruption. Industrial all risk, fire, BI.', 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6'),
    ('Engineering and construction', 'commercial/car', 'Projects, machinery and sensitive equipment during and after construction.', 'M4 20h16M6 20V9l4-3 4 3v11M14 20v-7h4v7'),
    ('Motor, marine and logistics', 'commercial/inventory', 'Goods in transit and the vehicles that move them.', 'M3 17h13l3-5h3M3 17V7h10v10'),
    ('Trade credit and bonds', 'commercial/financial-assets', 'Non-payment by buyers and performance obligations to counterparties.', 'M4 6h16v12H4zM4 10h16M8 15h4'),
    ('Liability', 'commercial/core-liability', 'What the business owes if it is sued. General, professional indemnity, D&O, IMI.', 'M12 3v18M5 8h14M7 8l-3 7h6zM17 8l-3 7h6z'),
    ('Cyber', 'commercial/cyber', 'Breach response, business interruption and liability after an incident.', 'M4 5h16v14H4zM8 12h8M8 9h5'),
    ('Workforce', 'commercial/workmen', 'WICA, foreign worker medical and bond, group health, benefits, keyman.', 'M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2 20c0-4 3-6 7-6M15 11l2 2 4-4'),
    ('Personal', 'personal/home-contents', 'Home contents, fire, travel, maid and personal accident for individuals.', 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6'),
]
# What we do: each point sits beside a mock of what the TRS team sends the client. The mocks are
# documents (a review, a claim update, a comparison), not app screens, so nobody expects a client login.
TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>'
MK_TEAM = ('<div class="s-mk-s"><div class="s-mk-hd"><span>Account review</span><span>Harbourline Logistics Pte Ltd</span></div><b class="s-mk-ti">Your TRS team</b><ul class="s-mk-tm">'
           + ''.join(f'<li><i>{i}</i><span><b>{r}</b><span>{d}</span></span></li>' for i, r, d in [
               ('AL', 'Account lead', 'Reviews, renewals and day-to-day questions'), ('PL', 'Placement', 'Market approach, terms and wording'), ('CL', 'Claims', 'From first notice to settlement')])
           + '</ul><b class="s-mk-st">This quarter</b><ul class="s-mk-log">'
           + ''.join(f'<li><span>{d}</span><span>{t}</span><em>Done</em></li>' for d, t in [
               ('12 Oct', 'New forklift fleet added to the machinery schedule'), ('03 Oct', 'WICA headcount updated from 142 to 168'), ('21 Sep', 'New warehouse lease checked for insurance clauses')])
           + '</ul><p class="s-mk-ft">Prepared by your TRS team</p></div>')
MK_CLAIM = ('<div class="s-mk-s"><div class="s-mk-hd"><span>Claim update</span><span>Ref. CL-2611</span></div><b class="s-mk-ti">Water damage, Tuas warehouse</b><ol class="s-mk-steps">'
            + ''.join(f'<li class="{c}"><i>{TICK if c == "ok" else ""}</i><span><b>{t}</b><span>{d}</span></span></li>' for c, t, d in [
                ('ok', 'Notified to insurer', '2 Oct'), ('ok', 'Loss adjuster appointed', '4 Oct'), ('ok', 'Documents submitted', '11 Oct'),
                ('now', "Adjuster's report", 'Due Friday'), ('', 'Settlement', 'Next')])
            + '</ol><div class="s-mk-msg"><b>From your claims handler</b>The adjuster\'s report is due Friday. I will send you the figures and our view before you reply to the insurer.</div>'
            '<p class="s-mk-ft">Prepared by your TRS team</p></div>')
MK_QUOTE = ('<div class="s-mk-s"><div class="s-mk-hd"><span>Renewal comparison</span><span>Industrial all risks</span></div><b class="s-mk-ti">Three quotes, side by side</b>'
            '<table class="s-mk-tb"><thead><tr><th></th><th>Insurer A</th><th>Insurer B</th><th class="rec">Insurer C</th></tr></thead><tbody>'
            + ''.join(f'<tr><th>{r}</th>' + ''.join(f'<td{" class=rec" if j == 2 else ""}>{v}</td>' for j, v in enumerate(vs)) + '</tr>' for r, vs in [
                ('Annual premium', ['S$48,200', 'S$43,950', 'S$46,700']), ('Deductible', ['S$10,000', 'S$25,000', 'S$10,000']),
                ('Flood limit', ['S$5M', 'S$2M', 'S$5M']), ('New exclusions', ['None', 'Vacant 30+ days', 'None'])])
            + '</tbody></table><div class="s-mk-msg"><b>Our view</b>B is cheapest but cuts the flood limit to S$2M. C keeps your cover for S$1,500 less than A.</div>'
            '<p class="s-mk-ft">Prepared by your TRS team</p></div>')
WHAT_WE_DO = [
    ('Active risk coverage', 'Dedicated risk management team',
     'A named team with more than 50 years of combined experience in broking, underwriting and claims, assigned to each account from the first review to every renewal after it.',
     f'<a class="s-btn s-p" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker {ARROW}</a>', MK_TEAM),
    ('Talk to humans', 'White-glove service',
     'TRS gathers the information, negotiates with insurers and runs the claim. The business completes and signs the proposal forms.',
     '<a href="#" class="s-btn s-o" data-ctac-modal data-track="page_get_quote">Get a quote</a>', MK_CLAIM),
    ('Price discovery', 'Transparent pricing and review',
     'Quotes are set side by side with premium, deductibles and key exclusions in plain terms. Each programme is reviewed against the business as it stands, not as it stood last year.',
     '<a class="s-btn s-o" href="/pricing">See pricing</a>', MK_QUOTE),
]
MK_POLICY = ('<div class="s-mk-s"><div class="s-mk-hd"><span>Policy schedule</span><span>Harbourline Logistics Pte Ltd</span></div><b class="s-mk-ti">Your programme at a glance</b>'
             '<table class="s-mk-tb"><thead><tr><th>Policy</th><th>Insurer</th><th>Renews</th><th></th></tr></thead><tbody>'
             + ''.join(f'<tr><th>{a}</th><td>{b}</td><td>{c}</td><td><em class="s-mk-chip{" due" if d == "Review due" else ""}">{d}</em></td></tr>' for a, b, c, d in [
                 ('Industrial all risks', 'Insurer A', '31 Mar 2027', 'In force'), ('Work injury (WICA)', 'Insurer B', '30 Nov 2026', 'Review due'),
                 ('Public liability', 'Insurer C', '31 Mar 2027', 'In force'), ('Marine cargo', 'Insurer A', '14 Jan 2027', 'In force'), ('Group medical', 'Insurer D', '30 Jun 2027', 'In force')])
             + '</tbody></table><p class="s-mk-ft">Prepared by your TRS team</p></div>')
# One platform, Harvey's audience router: two dark cards; the hovered one widens and the other fades.
ONE_TEAM = [
    ('Claims Handling', 'File and track claims in one place with real people who follow through fast.', 'Talk to a claims broker',
     f'href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct"', 'logistics.jpg', MK_CLAIM),
    ('Policy Management', 'Access every policy, update details, and stay organised across insurers and locations.', 'Review your policies',
     'href="#" data-ctac-modal data-track="page_get_quote"', 'finance.jpg', MK_POLICY),
]
# Insurer partners (logos from the GIA and LIA member directories, Oct 2026), in the order the client gave. Shown as a hairline logo wall.
CARRIERS = [
    ('aia', 'AIA', 'Group life and health'), ('allianz', 'Allianz', 'Property and casualty'), ('bhsi', 'BHSI', 'Specialty lines'),
    ('taiping', 'China Taiping', 'Property and engineering'), ('chubb', 'Chubb', 'Global programmes'), ('cigna', 'Cigna', 'International health'),
    ('coface', 'Coface', 'Trade credit'), ('eq', 'EQ Insurance', 'Bonds and guarantees'), ('great-eastern', 'Great Eastern', 'Employee benefits'),
    ('income', 'Income', 'Motor and SME'), ('liberty', 'Liberty', 'Motor and commercial'), ('lloyds', "Lloyd's", 'Specialist risk'),
    ('qbe', 'QBE', 'Workforce and liability'), ('msig', 'MSIG', 'Marine and property'), ('raffles-health', 'Raffles Health', 'Corporate health'),
    ('singlife', 'Singlife', 'Group life and benefits'), ('swiss-re', 'Swiss Re', 'Large corporate risk'), ('tokio-marine', 'Tokio Marine', 'Marine and cargo'),
    ('zurich', 'Zurich', 'Liability and cyber'),
]


def home():
    b = ('<section class="s-w"><div class="s-hero2 s-hs"><div><h1 class="s-h1">Insurance for businesses<br>that <span class="s-rot" data-rot="grow.|scale.|hire.|build.|export.|expand.">grow.</span></h1>'
         '<p class="s-lede">TRS is an insurance brokerage business.</p></div>'
         '<div class="s-hr"><p>TRS places property, liability, cyber and workforce cover with 18 Singapore-licensed insurers, then runs the policies, claims and renewals for each client with one named team.</p>'
         + ctas() + '</div></div></section>'
         '<div class="s-w"><div class="s-sky"><img src="/images/skyline-sg.jpg" alt="Singapore skyline with Marina Bay Sands and the Singapore Flyer at dusk" fetchpriority="high"></div></div>'
         '<section class="s-w"><div class="s-vn">'
         '<div><p class="s-vn-l">Premium saved through programme reviews</p><p class="s-vn-n">$10M+</p></div>'
         '<div><p class="s-vn-l">Clients served</p><p class="s-vn-n">250+</p></div>'
         '<div><p class="s-vn-l">Average saving on premium*</p><p class="s-vn-n">15%</p></div>'
         '<p class="s-vn-note"><b>Note</b>: figures in SGD. *Average across clients who moved their programme to TRS from a previous broker.</p>'
         '</div></section>')  # client logos (LOGOS) hidden 24 Oct 2026 until client permission is confirmed
    b += ('<section class="s-sec"><div class="s-w"><p class="s-pill">What we do</p><h2 class="s-h2">Why leading companies trust TRS</h2><p class="s-sub">TRS runs the insurance programme for the business, from the first review to every claim after it.</p>'
          '<div class="s-wd">' + ''.join(f'<div class="s-wd-r"><div class="s-wd-t"><span class="s-pill">{e(bdg)}</span><h3>{e(t)}</h3><p>{e(d)}</p><div class="s-acts">{cta}</div></div>'
                                         f'<figure class="s-mk">{mk}<figcaption>Illustrative example</figcaption></figure></div>' for bdg, t, d, cta, mk in WHAT_WE_DO)
          + '</div></div></section>')
    b += ('<section class="s-sec s-tint"><div class="s-w"><p class="s-pill">Results</p><h2 class="s-h2">Proven in action</h2><p class="s-sub">Turning great experiences into impactful savings.</p><div class="s-outs s-outs-q">'
          '<figure class="s-oc s-q"><blockquote>&ldquo;The TRS team was professional from the first meeting. Their advice was transparent, so we could make the right decisions for the business with confidence.&rdquo;</blockquote><figcaption>Chief Financial Officer<span>TRS client</span></figcaption></figure>'
          '<div class="s-oc"><span>Saved in premiums for one client</span><b>$100K</b></div>'
          '<div class="s-oc"><span>From first review to a placed programme</span><b>14 days</b></div></div></div></section>')
    b += ('<section class="s-sec"><div class="s-w"><div class="s-pf-h"><p class="s-pill">One team</p><h2 class="s-h2">One Platform for Risk and Coverage</h2>'
          '<p class="s-sub">Businesses and their finance teams do their best work with TRS. Run everything your insurance programme needs through one dedicated team.</p></div><div class="s-pf-row">'
          + ''.join(f'<a class="s-pf-c" {attrs}><div class="s-pf-bg"><img src="/images/industries/{img}" alt="" loading="lazy"></div>'
                    f'<div class="s-pf-t"><h3>{e(t)}</h3><p>{e(d)}</p><span class="s-pf-b">{e(cta)}</span></div><div class="s-pf-mk" aria-hidden="true">{mk}</div></a>' for t, d, cta, attrs, img, mk in ONE_TEAM)
          + '</div></div></section>')
    b += ('<section class="s-sec" id="services"><div class="s-w"><p class="s-pill">Products</p><h2 class="s-h2">Get the right insurance for you</h2><p class="s-sub">TRS structures cover around the risk profile of the business and places it with 18 Singapore-licensed insurers.</p><div class="s-north">'
          + ''.join(f'<a class="s-ni" href="/{p}/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="{ic}"/></svg><h3>{e(t)}</h3><p>{e(d)}</p></a>' for t, p, d, ic in SERVICES)
          + '</div></div></section>')
    b += ('<section class="s-sec" id="partners"><div class="s-w s-pt"><div class="s-pt-l"><p class="s-pill">Our partners</p><h2 class="s-h2">Coverage from leading insurers.</h2>'
          '<p class="s-sub">We work with top-rated commercial insurers to bring you fast quotes, broad coverage, and dependable protection for your business.</p>'
          '<div class="s-acts"><a href="#" class="s-btn s-o" data-ctac-modal data-track="page_get_quote">Get a quote</a></div></div>'
          '<ul class="s-lw" aria-label="Insurer partners">'
          + ''.join(f'<li><img src="/logos/carriers/{f}.png" alt="{e(n)}" loading="lazy"><b>{e(n)}</b><span>{e(c)}</span></li>' for f, n, c in CARRIERS)
          + '</ul></div></section>')
    cards = ''.join(f'<div class="s-cr-c" data-i="{i}"><a class="s-cr-img" href="/solutions/{s}/"><img src="/images/industries/{SOL[s][1]}" alt="" loading="lazy"><span class="s-tg">{e(SOL[s][0])}</span></a>'
                    f'<div class="s-cr-t"><h3>{e(SOL[s][0])}</h3><p>{e(SOL[s][2])}</p><a href="/solutions/{s}/">See more &rarr;</a></div></div>' for i, s in enumerate(SOL_ORDER))
    b += ('<section class="s-sec s-cr" id="solutions"><div class="s-w s-cr-head"><p class="s-pill">Deep domain expertise</p><h2 class="s-h2">Protecting businesses across industries</h2>'
          '<div class="s-cr-ctl"><button type="button" class="s-cr-ar" data-cr="-1" aria-label="Previous industry">&larr;</button><div class="s-cr-dots">'
          + ''.join(f'<button type="button" data-crd="{i}" aria-label="{e(SOL[s][0])}"></button>' for i, s in enumerate(SOL_ORDER))
          + '</div><button type="button" class="s-cr-ar" data-cr="1" aria-label="Next industry">&rarr;</button></div></div>'
          f'<div class="s-cr-vp"><div class="s-cr-tr">{cards}</div></div></section>')
    return b + close_band()


def about():
    return ('<h1 class="s-vh">About TRS</h1><section class="s-sec" style="padding-top:88px"><div class="s-w">'
            '<div class="s-ablk" aria-hidden="true"><span class="t">TRS</span><span class="d">Trade Risk Solutions</span><span class="c">保风</span></div>'
            '<div class="s-abg"><div><p class="s-cpl" lang="zh-Hans" aria-label="赚钱靠机遇，成功靠信誉"><span>赚钱靠机遇</span><span>成功靠信誉</span></p>'
            '<p class="s-cpl-cap">Opportunity earns money. Integrity earns success.</p></div><div class="s-ab">'
            '<p>TRS is an insurance brokerage for businesses, based in Singapore. For over 15 years TRS has placed corporate programmes for companies from early-stage technology start-ups to institutional enterprises.</p>'
            "<p>TRS acts for the client, not the insurer. The team works as an extension of the client's finance or operations function: it structures the cover, negotiates the premium and argues the claim.</p>"
            '<p>TRS is independent. There are no volume quotas and no carrier alignments. Each placement is compared across 18 Singapore-licensed insurers, including AXA, Chubb and Allianz, and decided on the wording and the price.</p>'
            '<p>TRS writes in plain terms. Before anything is signed, the policy is summarised into what is covered, what is excluded, the deductibles and the limits.</p>'
            '<p>TRS is fast without cutting corners. Specialists work on digital workflows, so comparative quotes from several insurers and a compliant policy binder arrive within 48 hours.</p>'
            '<p>TRS stays for the long term. As headcount, sites and operations change, the programme is audited twice a year so the cover keeps pace with the business.</p>'
            '</div></div></div></section>' + close_band())


def write(path, body):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    open(path, 'w').write(page(path, body))


write('index.html', home())
write('about.html', about())
for p in GROUP:
    write(p + '/index.html', product(p))
for s in SOL:
    write('solutions/%s/index.html' % s, solution(s))
print('built', 2 + len(GROUP) + len(SOL), 'pages')


# ---------------------------------------------------------------- insights
import sys, datetime, glob
sys.path.insert(0, os.path.dirname(__file__))
from insights_content import POSTS
SITE = 'https://www.traderisksolutions.com.sg'
CATS = ['Workforce', 'Liability', 'Property and projects', 'Claims', 'Working with a broker']


def ins_head(title, desc, url, jsonld):
    t = e(title)
    return ('<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
            '  <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />\n  <link rel="shortcut icon" href="/favicon.ico" />\n'
            '  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />\n'
            f'  <title>{t}</title>\n  <meta name="description" content="{html.escape(desc)}" />\n  <link rel="canonical" href="{url}" />\n'
            f'  <meta property="og:type" content="article" />\n  <meta property="og:url" content="{url}" />\n  <meta property="og:title" content="{t}" />\n'
            f'  <meta property="og:description" content="{html.escape(desc)}" />\n  <meta property="og:image" content="https://traderisksolutions.com.sg/og-image-2026.png" />\n'
            '  <meta property="og:site_name" content="Trade Risk Solutions" />\n  <meta name="twitter:card" content="summary_large_image" />\n'
            '  ' + FONTS + '\n  <link rel="stylesheet" href="/styles/main.css" />\n  <link rel="stylesheet" href="/styles/site.css" />\n'
            '  <script defer src="/_vercel/insights/script.js"></script>\n'
            '  <script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False) + '</script>\n</head>')


def ins_page(head, body):
    return ('<!DOCTYPE html>\n<html lang="en">\n' + head + '\n<body class="s-site">\n  <div id="nav-root"></div>\n' + body +
            '\n  <div id="footer-root"></div>\n  <script src="/scripts/product-taxonomy.js"></script>\n  <script src="/scripts/nav.js"></script>\n'
            '  <script src="/scripts/analytics.js" defer></script>\n  <script src="/scripts/site.js" defer></script>\n</body>\n</html>\n')


def iso(d):
    return datetime.datetime.strptime(d, '%d %b %Y').date().isoformat()


def table_html(t):
    head, rows = t
    return ('<div class="s-tbl"><table><thead><tr>' + ''.join(f'<th>{e(h)}</th>' for h in head) + '</tr></thead><tbody>' +
            ''.join('<tr>' + ''.join(f'<td>{e(c)}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table></div>')


POSTS_BY_PRODUCT = {}
for po in POSTS:
    for l in po['links']:
        POSTS_BY_PRODUCT.setdefault(l, []).append(po)

for po in POSTS:
    url = f"{SITE}/insights/{po['slug']}/"
    secs = ''
    for i, sec in enumerate(po['sections']):
        h, paras = sec[0], sec[1]
        secs += f'<h2>{e(h)}</h2>' + ''.join(f'<p>{e(x)}</p>' for x in paras)
        if len(sec) > 2 and sec[2]:
            secs += table_html(sec[2])
        if i == 1:
            secs += (f'<div class="s-in-cta"><b>Want this checked against your own policies?</b>'
                     f'<a class="s-btn s-on" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker</a></div>')
    faq = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in po['faq'])
    rel = ''.join(f'<a href="/{l}/"><span><b>{e(GROUP[l][2])}</b><span>{e(PROD[l]["lede"])}</span></span>{ARROW}</a>' for l in po['links'] if l in GROUP)
    src = ''.join(f'<li><a href="{u}" target="_blank" rel="noopener">{e(lbl)}</a></li>' for lbl, u in po['sources'])
    more = [x for x in POSTS if x['cat'] == po['cat'] and x['slug'] != po['slug']][:3]
    morel = ''.join(f'<a class="s-row" href="/insights/{x["slug"]}/"><span class="s-rc">{e(x["cat"])}</span><b>{e(x["title"])}</b><span class="s-rd">{x["minutes"]} min read</span></a>' for x in more)
    body = (f'<article class="s-w s-art"><nav class="s-crumb" aria-label="Breadcrumb"><a href="/insights/">Insights</a><span>/</span>{e(po["cat"])}</nav>'
            f'<h1 class="s-art-h">{e(po["title"])}</h1><div class="s-by"><span>By the TRS broking team</span><span>{po["date"]}</span><span>{po["minutes"]} min read</span></div>'
            f'<div class="s-ans"><b>The short answer</b>{e(po["answer"])}</div><div class="s-prose">{secs}</div>'
            + (f'<h2 class="s-art-sub">Frequently asked questions</h2><div class="s-faq">{faq}</div>' if faq else '')
            + (f'<h2 class="s-art-sub">Related cover</h2><div class="s-rel">{rel}</div>' if rel else '')
            + (f'<h2 class="s-art-sub">Sources</h2><ul class="s-src">{src}</ul>' if src else '')
            + '<p class="s-disc">General information only, not advice on any particular policy. Cover depends on the policy wording and the insurer\'s terms.</p>'
            + (f'<h2 class="s-art-sub">More in {e(po["cat"].lower())}</h2><div class="s-list">{morel}</div>' if morel else '') + '</article>' + close_band())
    ld = [{'@context': 'https://schema.org', '@type': 'Article', 'headline': po['title'], 'description': po['desc'], 'datePublished': iso(po['date']),
           'dateModified': iso(po['date']), 'mainEntityOfPage': url, 'image': 'https://traderisksolutions.com.sg/og-image-2026.png',
           'author': {'@type': 'Organization', 'name': 'Trade Risk Solutions'}, 'publisher': {'@type': 'Organization', 'name': 'Trade Risk Solutions', 'logo': {'@type': 'ImageObject', 'url': 'https://traderisksolutions.com.sg/favicon-192.png'}}},
          {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
              {'@type': 'ListItem', 'position': 1, 'name': 'Insights', 'item': SITE + '/insights/'},
              {'@type': 'ListItem', 'position': 2, 'name': po['title'], 'item': url}]}]
    if po['faq']:
        ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in po['faq']]})
    os.makedirs(f"insights/{po['slug']}", exist_ok=True)
    open(f"insights/{po['slug']}/index.html", 'w').write(ins_page(ins_head(po['title'] + ' | TRS', po['desc'], url, ld), body))

feat = POSTS[0]
rows_html = ''.join(f'<a class="s-row" data-cat="{e(x["cat"])}" href="/insights/{x["slug"]}/"><span class="s-rc">{e(x["cat"])}</span><b>{e(x["title"])}</b><span class="s-rd">{x["minutes"]} min read</span></a>' for x in POSTS[1:])
idx = ('<section class="s-w"><div class="s-bh"><div><h1 class="s-h1">Insights</h1><p class="s-lede">Guides, rule changes and claim lessons for Singapore businesses.</p></div>'
       '<div class="s-flt" role="group" aria-label="Filter by topic"><button type="button" aria-pressed="true" data-c="all">All</button>'
       + ''.join(f'<button type="button" aria-pressed="false" data-c="{e(c)}">{e(c)}</button>' for c in CATS) + '</div></div>'
       f'<a class="s-feat" data-cat="{e(feat["cat"])}" href="/insights/{feat["slug"]}/"><span class="s-feat-im">{e(feat["title"].split("?")[0])}?</span><span><span class="s-rc">{e(feat["cat"])}</span>'
       f'<b>{e(feat["title"])}</b><span class="s-feat-d">{e(feat["desc"])}</span><span class="s-rd">{feat["minutes"]} min read</span></span></a>'
       f'<div class="s-list" id="s-list">{rows_html}</div><p class="s-empty" hidden>No posts on this topic yet.</p></section>' + close_band())
ld = {'@context': 'https://schema.org', '@type': 'Blog', 'name': 'TRS Insights', 'url': SITE + '/insights/',
      'blogPost': [{'@type': 'BlogPosting', 'headline': x['title'], 'url': f"{SITE}/insights/{x['slug']}/", 'datePublished': iso(x['date'])} for x in POSTS]}
os.makedirs('insights', exist_ok=True)
open('insights/index.html', 'w').write(ins_page(ins_head('Insights: business insurance guides for Singapore | TRS',
     'Guides to WICA, foreign worker insurance, D&O, professional indemnity, cyber, construction and claims for Singapore businesses, from the TRS broking team.',
     SITE + '/insights/', ld), idx))

# related reading on product pages
for pth, posts in POSTS_BY_PRODUCT.items():
    f = pth + '/index.html'
    if not os.path.exists(f):
        continue
    s0 = open(f).read()
    if 's-related-reading' in s0:
        continue
    links = ''.join(f'<a class="s-row" href="/insights/{x["slug"]}/"><span class="s-rc">{e(x["cat"])}</span><b>{e(x["title"])}</b><span class="s-rd">{x["minutes"]} min read</span></a>' for x in posts)
    sec = f'<section class="s-sec s-related-reading"><div class="s-w"><p class="s-pill">Insights</p><h2 class="s-h2">Related reading</h2><div class="s-list" style="margin-top:32px">{links}</div></div></section>'
    s0 = s0.replace('<section class="s-sec s-tint"><div class="s-w s-close">', sec + '<section class="s-sec s-tint"><div class="s-w s-close">', 1)
    open(f, 'w').write(s0)

# sitemap
sm = open('sitemap.xml').read()
add = ''.join(f'  <url><loc>https://traderisksolutions.com.sg/insights/{x["slug"]}/</loc><lastmod>{iso(x["date"])}</lastmod></url>\n' for x in POSTS if f'/insights/{x["slug"]}/' not in sm)
if '/insights/</loc>' not in sm:
    add = f'  <url><loc>https://traderisksolutions.com.sg/insights/</loc><lastmod>{iso(POSTS[0]["date"])}</lastmod></url>\n' + add
if add:
    open('sitemap.xml', 'w').write(sm.replace('</urlset>', add + '</urlset>'))
print('insights:', len(POSTS), 'posts')


# ---------------------------------------------------------------- working with TRS, claims history FAQ
# Copy follows fernstone.com/working-with-fernstone and /loss-run-faq word for word, with TRS in place of Fernstone.
def plain_head(title, desc, url, jsonld):
    return ins_head(title, desc, url, jsonld).replace('content="article"', 'content="website"')


def eb_hero(eb, h1, lede, acts=True):
    return (f'<section class="s-w"><div class="s-hero2 s-hero-home"><div><p class="s-pill">{e(eb)}</p><h1 class="s-h1">{e(h1)}</h1></div>'
            f'<div class="s-hr"><p>{e(lede)}</p>{ctas() if acts else ""}</div></div></section>')


def split(num, h2, items):
    return (f'<section class="s-sec s-sec-t"><div class="s-w s-split"><div><span class="s-num">{num}</span><h2 class="s-h2">{e(h2)}</h2></div><div class="s-items">'
            + ''.join(f'<div><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in items) + '</div></div></section>')


WORK_OFFER = [
    ('White-glove service before and after binding', 'You’ll have a dedicated team that learns your business, guides you through underwriting, and remains available after your policy is in place.'),
    ('Transparency throughout the quoting process', 'You’ll always know where your quote stands, what has been completed, and what we still need from you.'),
    ('Access to competitive insurance markets', 'We identify the carriers best suited to your business and work to find the right balance of price, coverage, and terms.'),
]
WORK_ASK = [
    ('Honesty throughout the quoting process', 'Accurate information allows us to represent your business properly, avoid surprises, and negotiate effectively on your behalf.'),
    ('An understanding that underwriting requires detail', 'Underwriters need to understand how your business operates before they can offer their best pricing and coverage.'),
    ('Prompt access to key documents', 'Providing requested documents quickly helps us keep the process moving and avoid unnecessary delays.'),
]
WORK_FIT = ['You want to save money without sacrificing the coverage your business needs.', 'You know your business inside and out.',
            'You take pride in running a strong, well-managed organisation.', 'You value a straightforward relationship with your insurance broker.']
WORK_NOFIT = ['You want the fastest possible quote, regardless of its price, coverage, or accuracy.', 'You want a quote without sharing meaningful details about your business.',
              'You are unwilling to provide the information underwriters need to evaluate your business.']
WORK_BOTTOM = ['We will do as much of the work as possible, but getting the best result will require a limited investment of your time.',
               'We will always tell you what we need, why we need it, and how we can help you get it. We do not make any money unless we find and place a policy that meets your needs. In return, we ask you to help us help you by being honest, responsive, and involved in the process.',
               'When we work together, we can present your business accurately and put you in the best position to receive competitive pricing and strong coverage.']
CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>'
CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/></svg>'


def close_custom(eb, h2, sub, acts):
    return (f'<section class="s-sec s-tint"><div class="s-w s-close"><p class="s-pill">{e(eb)}</p><h2 class="s-h2">{e(h2)}</h2><p class="s-sub">{e(sub)}</p>{acts}</div></section>')


def bs_block(cls, label, statement, pic, alt, items, flip=False):
    return (f'<section class="s-sec {cls}"><div class="s-w"><p class="s-pill">{e(label)}</p><p class="s-bs-st">{e(statement)}</p>'
            f'<div class="s-bs-g{" s-bs-flip" if flip else ""}"><div class="s-bs-pic"><img src="/images/{pic}" alt="{e(alt)}" loading="lazy"></div><div class="s-bs-l">'
            + ''.join(f'<div><h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in items) + '</div></div></div></section>')


def fit_col(label, h2, items):
    return (f'<div class="s-fit-c"><p class="s-pill">{e(label)}</p><h2>{e(h2)}</h2><ul>'
            + ''.join(f'<li><i>{i:02d}</i><span>{e(x)}</span></li>' for i, x in enumerate(items, 1)) + '</ul></div>')


work = ('<section class="s-w"><div class="s-hero2 s-hero-home"><div><p class="s-pill">A better broker relationship</p><h1 class="s-h1">Working with TRS</h1></div></div></section>'
        + bs_block('s-dark', 'What we offer you', 'We partner with you to lower your insurance costs, improve your coverage, and make the quoting process as clear as possible.',
                   'why-trs.jpg', 'A TRS broker reviewing a policy schedule with a client', WORK_OFFER)
        + bs_block('s-tint', 'What we ask of you', WORK_BOTTOM[0], 'industries/finance.jpg', 'A client team reviewing documents with their broker', WORK_ASK, flip=True)
        + '<section class="s-sec"><div class="s-w s-fit">'
        + fit_col('A good fit', 'Working with TRS is a fit for you if…', WORK_FIT) + fit_col('May not be a fit', 'Working with TRS may not be a fit for you if…', WORK_NOFIT)
        + '</div></section>'
        + '<section class="s-sec s-dark"><div class="s-w s-split"><div><p class="s-pill">The bottom line</p><h2 class="s-h2">The best result takes teamwork.</h2></div><div class="s-bl">'
        + ''.join(f'<p>{e(x)}</p>' for x in WORK_BOTTOM[1:]) + '</div></div></section>'
        + '<section class="s-sec s-sec-t"><div class="s-w"><div class="s-rel" style="margin-top:0"><a href="/claims-history-faq/"><span><b>Claims history FAQ</b><span>What insurers ask for, and how TRS helps you get it.</span></span>'
        + ARROW + '</a></div></div></section>'
        + close_custom('Ready to work together?', 'Tell us about your business.', 'Let’s find the right coverage.', ctas().replace('class="s-acts"', 'class="s-acts" style="justify-content:center"')))
os.makedirs('working-with-trs', exist_ok=True)
open('working-with-trs/index.html', 'w').write(ins_page(plain_head(
    'Working with TRS | How we collaborate', 'We partner with you to lower your insurance costs, improve your coverage, and make the quoting process as clear as possible.',
    SITE + '/working-with-trs/', {'@context': 'https://schema.org', '@type': 'WebPage', 'name': 'Working with TRS', 'url': SITE + '/working-with-trs/'}), work))

FAQ_GROUPS = [
    ('Understanding loss runs', [
        ('What is a loss run?', 'A loss run is a report produced by an insurance carrier that shows the claims history for one of your business insurance policies. Think of it as an official record of the claims reported during the time that carrier insured your business. The report typically includes the date and type of each claim, whether it is open or closed, how much the carrier has paid, and any money it has reserved for future payments.'),
        ('Why do insurance companies ask for loss runs?', 'Insurance companies use loss runs to understand your business’s claims history and evaluate its risk. Along with information about your operations, payroll, revenue, vehicles, locations, and coverage needs, loss runs help an underwriter decide whether to offer coverage and at what price. For many types of commercial insurance, carriers will not provide a firm quote without them.'),
        ('I have never had a claim. Why do I still need loss runs?', 'The insurance company needs confirmation directly from your previous carriers. A carrier-issued loss run provides an official record showing no reported losses. A clean loss history is a positive part of your submission and will help you qualify for better pricing / more coverage options. Think about it like a positive reference check when applying for a job.'),
    ]),
    ('Requesting and using reports', [
        ('How do I get my loss runs?', 'You can usually request loss runs from your current or former insurance broker, directly from the insurance carrier, or through the carrier’s online portal. You need your business name, policy number, policy period. If multiple carriers have insured your business, request a separate report from each one.'),
        ('Can TRS help me get my loss runs?', 'Yes we can. We will work with you to track down an old certificate of insurance, policy document, invoice, or other record showing who insured your business. Once we identify the correct carriers and policy numbers, TRS can prepare the requests, collect required authorisations, and follow up until we receive the reports. If you cannot find every document, we will help piece together what is available and determine the best next step.'),
        ('I am friends with my current or former broker. Will they know I am shopping?', 'Not if you request your loss runs directly from the insurance carrier. You do not have to involve your broker. If you ask your broker to provide the reports, they may assume you are shopping. TRS can help identify and contact carriers directly so you can explore options without unnecessarily involving your current or former broker.'),
        ('How does getting my loss runs benefit me?', 'Loss runs show the claims history insurers use to evaluate your business. Reviewing them early helps confirm accuracy, identify open claims, review reserves, explain past losses, avoid quoting delays, reach more carriers, and improve your negotiating position at renewal. The goal is to give underwriters a complete and accurate picture of your business.'),
        ('Can I use the loss runs TRS helps me obtain with other brokers?', 'Yes. You can share your loss runs with another broker. They are part of your business’s insurance history, and working with TRS does not prevent you from using them elsewhere. Another broker or carrier may request an updated copy or additional authorisation.'),
    ]),
    ('Timing and requirements', [
        ('When should I get my loss runs?', 'Start early—ideally 60 to 90 days before your renewal date. That gives you time to request reports from multiple carriers, follow up on delays, correct errors, and answer questions about previous claims. Waiting until the final weeks can limit the carriers able to review your business.'),
        ('How many years of loss runs do I need?', 'Most insurance companies ask for three to five years of loss history, although some request more. The requirement depends on the insurance type, carrier, industry, and complexity of your business. TRS will tell you which policy periods and coverage lines are needed.'),
        ('How recent do my loss runs need to be?', 'Insurance companies generally want loss runs valued within the last 30 to 90 days. The valuation date tells the underwriter when claim information was last updated. Requirements vary, so an older report may need to be refreshed before a quote is finalised.'),
        ('Do I need loss runs for every type of insurance?', 'Not always, but you may need separate reports for workers’ compensation, general liability, commercial auto, property, professional liability, and umbrella or excess liability. If different carriers provided different policies, each carrier may need to produce its own loss run.'),
    ]),
    ('Fixing issues and underwriting outcomes', [
        ('What should I do if a claim on my loss run is incorrect?', 'Tell your broker or insurance carrier as soon as possible. Common issues include claims that should be closed, incorrect payments, outdated reserves, duplicates, or claims assigned to the wrong policy. TRS can help identify issues and ask the appropriate carrier or claims team to review them, but only the carrier can officially change its records.'),
        ('What if an old claim is still open?', 'An open claim does not automatically prevent coverage, but the underwriter will probably want more information: what happened, why it remains open, how much has been paid and reserved, and what your business has done since the loss. A clear explanation and current claim information can make a meaningful difference.'),
        ('What if my broker or carrier is taking too long to respond?', 'Follow up in writing and keep a record of every request. Confirm the correct business name, policy numbers, coverage lines, and policy periods. TRS can follow up, contact the appropriate carrier departments, and determine whether a different authorisation or request method is needed.'),
    ]),
]
faq = (eb_hero('Claims history FAQ', 'Claims history, made simple',
               'Loss runs are one of the most important—and sometimes most frustrating—parts of shopping for business insurance. TRS helps you understand what you need, track down the right reports, and make sure your insurance history is presented accurately.')
       + '<section class="s-sec s-sec-t" style="padding-bottom:0"><div class="s-w"><p class="s-pill">A practical guide</p><h2 class="s-h2">Claims history, step by step</h2></div></section>'
       + ''.join(f'<div class="s-fqh"><div class="s-w"><h2>{e(g)}</h2><span>Section {i} of {len(FAQ_GROUPS)}</span></div></div><div class="s-w">'
                 + ''.join(f'<div class="s-qa"><h3>{e(q)}</h3><p>{e(a)}</p></div>' for q, a in qs) + '</div>'
                 for i, (g, qs) in enumerate(FAQ_GROUPS, 1))
       + close_custom('Need help?', 'Let’s get your claims history together.',
                      'TRS can help identify what is needed, request the right reports, review them for potential issues, and prepare your business for the insurance market.',
                      f'<div class="s-acts" style="justify-content:center"><a class="s-btn s-p" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a TRS advisor {ARROW}</a></div>'))
os.makedirs('claims-history-faq', exist_ok=True)
open('claims-history-faq/index.html', 'w').write(ins_page(plain_head(
    'Claims History FAQ: loss runs for business insurance | TRS',
    'What a loss run is, why insurers ask for one, how to get yours and how TRS helps you present your claims history accurately.',
    SITE + '/claims-history-faq/',
    {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for _, qs in FAQ_GROUPS for q, a in qs]}), faq))
sm = open('sitemap.xml').read()
add = ''.join(f'  <url><loc>https://traderisksolutions.com.sg/{p}/</loc><lastmod>2026-10-28</lastmod></url>\n' for p in ('working-with-trs', 'claims-history-faq') if f'/{p}/</loc>' not in sm)
if add:
    open('sitemap.xml', 'w').write(sm.replace('</urlset>', add + '</urlset>'))
print('built working-with-trs and claims-history-faq')


# ---------------------------------------------------------------- canonical host
# The apex redirects to www, and Search Console tracks www, so every canonical, og:url and sitemap URL uses www.
APEX, WWW = 'https://traderisksolutions.com.sg/', 'https://www.traderisksolutions.com.sg/'
for f in glob.glob('**/*.html', recursive=True) + ['sitemap.xml', 'robots.txt']:
    if f.startswith(('dashboard/', 'corpcover/', 'newsouthsea/', 'benefixe/', 'ai-inbound/', 'tools/', 'supabase/', 'roadplus/', 'node_modules/')):
        continue
    s0 = open(f).read()
    t = re.sub(r'(<link rel="canonical" href="|<meta property="og:url" content="|<loc>|Sitemap: )https://traderisksolutions\.com\.sg/', lambda m: m.group(1) + WWW, s0)
    t = t.replace('"item": "' + APEX, '"item": "' + WWW)
    if t != s0:
        open(f, 'w').write(t)
print('canonical host set to www')


# ---------------------------------------------------------------- cache-busting
# CSS and JS are served with a one-day browser cache (vercel.json), favicons longer.
# Every site page links them with ?v=<content hash>, so a change reaches returning visitors at once.
import hashlib, glob
ASSETS = ['/styles/site.css', '/styles/main.css', '/scripts/site.js', '/scripts/nav.js', '/scripts/product-taxonomy.js',
          '/scripts/analytics.js', '/favicon.ico', '/favicon-192.png', '/apple-touch-icon.png']
VER = {a: hashlib.sha1(open(a.lstrip('/'), 'rb').read()).hexdigest()[:8] for a in ASSETS}
SKIP = ('dashboard/', 'corpcover/', 'newsouthsea/', 'benefixe/', 'ai-inbound/', 'tools/', 'supabase/', 'roadplus/', 'node_modules/')
n = 0
for f in glob.glob('**/*.html', recursive=True):
    if f.startswith(SKIP) or f.startswith('googled'):
        continue
    s = open(f).read(); t = s
    for a, v in VER.items():
        t = re.sub(r'(["\'])' + re.escape(a) + r'(\?v=[0-9a-f]+)?(["\'])', lambda m: m.group(1) + a + '?v=' + v + m.group(3), t)
    if t != s:
        open(f, 'w').write(t); n += 1
print('versioned asset links in', n, 'pages')


# ---------------------------------------------------------------- link previews
# New share image on every page; the home page description matches the new copy.
HOME_DESC = ('TRS is an insurance broker for businesses in Singapore. Property, liability, cyber and '
             'workforce cover placed with 18 Singapore-licensed insurers.')
for f in glob.glob('**/*.html', recursive=True):
    if f.startswith(SKIP) or f.startswith('googled'):
        continue
    s = open(f).read(); t = s.replace('/og-image.png"', '/og-image-2026.png"')
    if f == 'index.html':
        t = re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*(")',
                   lambda m: m.group(1) + HOME_DESC + m.group(2), t)
    if t != s:
        open(f, 'w').write(t)
print('share image and home description set')


# ---------------------------------------------------------------- search metadata
# Product pages get their own title and description (the archived heads had none), every page
# gets structured data, and legacy pages link to canonical (trailing-slash) URLs.
from seo_meta import PRODUCT_META, INSIGHT_TITLES, SOLUTION_META, ABOUT_META
ORG = {'@type': 'InsuranceAgency', '@id': WWW + '#org', 'name': 'Trade Risk Solutions', 'alternateName': 'TRS',
       'url': WWW, 'logo': WWW + 'favicon-192.png', 'image': WWW + 'og-image-2026.png',
       'description': HOME_DESC, 'telephone': '+65 6238 0888', 'email': 'enquiry@trade-risksol.com',
       'address': {'@type': 'PostalAddress', 'streetAddress': 'Suntec Tower 2, 9 Temasek Boulevard',
                   'addressLocality': 'Singapore', 'postalCode': '038989', 'addressCountry': 'SG'},
       'areaServed': {'@type': 'Country', 'name': 'Singapore'}}


def set_meta(s, title=None, desc=None):
    if title:
        s = re.sub(r'<title>.*?</title>', lambda m: f'<title>{html.escape(title, quote=False)}</title>', s, count=1, flags=re.S)
        s = re.sub(r'(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*(")', lambda m: m.group(1) + html.escape(title) + m.group(2), s)
    if desc:
        d = html.escape(desc)
        if 'name="description"' not in s:
            s = s.replace('</title>', '</title>\n  <meta name="description" content="" />', 1)
        s = re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*(")', lambda m: m.group(1) + d + m.group(2), s)
    return s


def set_ld(s, data):
    s = re.sub(r'\s*<script type="application/ld\+json" data-seo>.*?</script>', '', s, flags=re.S)
    return s.replace('</head>', '  <script type="application/ld+json" data-seo>' + json.dumps(data, ensure_ascii=False) + '</script>\n</head>', 1)


def crumbs_ld(items):
    return {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': WWW + u} for i, (n, u) in enumerate(items)]}


def edit(f, fn):
    s = open(f).read(); t = fn(s)
    if t != s:
        open(f, 'w').write(t)


edit('index.html', lambda s: set_ld(set_meta(s, desc=HOME_DESC), {'@context': 'https://schema.org', '@graph': [
    ORG, {'@type': 'WebSite', '@id': WWW + '#site', 'url': WWW, 'name': 'Trade Risk Solutions', 'publisher': {'@id': WWW + '#org'}}]}))
edit('about.html', lambda s: set_ld(set_meta(s, *ABOUT_META), {'@context': 'https://schema.org', '@graph': [
    ORG, {'@type': 'AboutPage', 'url': WWW + 'about', 'about': {'@id': WWW + '#org'}}]}))
for p, (title, desc) in PRODUCT_META.items():
    name = GROUP[p][2]
    edit(p + '/index.html', lambda s: set_ld(set_meta(s, title, desc), {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Service', 'name': name, 'serviceType': name, 'description': desc, 'url': WWW + p + '/',
         'provider': ORG, 'areaServed': {'@type': 'Country', 'name': 'Singapore'}},
        crumbs_ld([('Home', ''), (name, p + '/')])]}))
for slug in SOL:
    edit('solutions/%s/index.html' % slug, lambda s: set_ld(set_meta(s, *SOLUTION_META[slug]), {'@context': 'https://schema.org', '@graph': [
        crumbs_ld([('Home', ''), (SOL[slug][0], 'solutions/%s/' % slug)])]}))
for po in POSTS:
    edit('insights/%s/index.html' % po['slug'], lambda s: set_meta(s, INSIGHT_TITLES[po['slug']]).replace(
        'content="https://traderisksolutions.com.sg/og-image-2026.png"', 'content="' + WWW + 'og-image-2026.png"'))
edit('business/index.html', lambda s: s.replace('<h2 class="biz-showcase-h2">Business insurance across every risk category</h2>',
                                                 '<h1 class="biz-showcase-h2">Business insurance across every risk category</h1>'))
edit('workforce/index.html', lambda s: s.replace('href="/commercial/professional-indemnity"', 'href="/employees/dao/"'))
edit('chat/index.html', lambda s: s if 'name="robots"' in s else s.replace('</title>', '</title>\n  <meta name="robots" content="noindex, follow" />', 1))
for f in ('business/index.html', 'workforce/index.html'):
    edit(f, lambda s: re.sub(r'href="/((?:commercial|employees|personal|consumers)/[a-z-]+|workforce|business)"', r'href="/\1/"', s))
edit('workforce/index.html', lambda s: set_meta(s, 'Workforce Insurance & Employee Benefits Singapore | TRS',
    'Workforce insurance in Singapore: WICA, foreign worker medical and bond, group medical, employee benefits and keyman.'))
edit('business/index.html', lambda s: set_meta(s, desc='Business insurance in Singapore: property, liability, cyber, marine, construction, trade credit and bonds, placed by TRS.'))
print('search metadata set on', len(PRODUCT_META), 'product pages')
