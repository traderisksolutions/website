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
    return ('<section class="s-sec s-tint"><div class="s-w s-close"><h2 class="s-h2">Find out what the right coverage looks like for you.</h2>'
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
    return (f'<section class="s-sec s-dark"><div class="s-w"><p class="s-eb">{e(eyebrow)}</p><h2 class="s-h2">{e(heading)}</h2><div class="s-cov">'
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
        b += ('<section class="s-sec"><div class="s-w"><p class="s-eb">Deep domain expertise</p><h2 class="s-h2">Placed for the businesses that carry this risk</h2>'
              '<div class="s-ic">' + ''.join(card(s) for s in FOR[p]) + '</div></div></section>')
    b += ('<section class="s-sec s-tint"><div class="s-w"><p class="s-eb">How TRS places it</p><h2 class="s-h2">From the first review to every claim after it</h2><div class="s-steps">'
          '<div><i>1</i><h3>Review</h3><p>A named broker reads the current policy against how the business runs today and lists the gaps.</p></div>'
          '<div><i>2</i><h3>Market</h3><p>TRS takes the risk to the insurers with appetite for it and sets the quotes side by side: premium, deductibles, exclusions.</p></div>'
          '<div><i>3</i><h3>Manage</h3><p>The same team handles mid-term changes, renewals and the claim, from first notice to settlement.</p></div></div></div></section>')
    sibs = [x for x in GROUP if GROUP[x][1] == sub and x != p]
    if sibs:
        b += f'<section class="s-sec"><div class="s-w"><p class="s-eb">{e(sub)}</p><h2 class="s-h2">More in {e(sub.lower())}</h2>{rows(sibs)}</div></section>'
    return b + close_band()


def solution(slug):
    n, img, line = SOL[slug]
    d = SOLD[slug]
    b = hero(crumb(['<a href="/#solutions">Solutions</a>', e(n)]), n, d['lede'], d['desc'])
    b += f'<div class="s-w"><div class="s-wide"><img src="/images/industries/{img}" alt="{e(n)}"></div></div>'
    b += '<div style="height:104px"></div>' + cov(d['items'], 'Key exposures', line)
    uses = [p for p in GROUP if slug in FOR.get(p, [])]
    if uses:
        b += f'<section class="s-sec"><div class="s-w"><p class="s-eb">Products</p><h2 class="s-h2">The cover {e(n.lower())} businesses buy</h2>{rows(uses)}</div></section>'
    b += ('<section class="s-sec s-tint"><div class="s-w"><p class="s-eb">Proven in action</p><h2 class="s-h2">Turning great experiences into impactful savings</h2><div class="s-outs">'
          '<div class="s-oc"><span>Singapore-licensed insurers TRS places with</span><b>18</b></div>'
          '<div class="s-oc"><span>Years placing corporate programmes</span><b>15+</b></div>'
          '<div class="s-oc"><span>Clients served</span><b>250+</b></div></div></div></section>')
    b += ('<section class="s-sec"><div class="s-w"><p class="s-eb">Deep domain expertise</p><h2 class="s-h2">Protecting businesses across industries</h2><div class="s-ic">'
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


def home():
    b = ('<section class="s-w"><div class="s-hero2 s-hero-home"><div><h1 class="s-h1">Insurance for businesses<br>that <span class="s-rot" data-rot="grow.|scale.|hire.|build.|export.|expand.">grow.</span></h1>'
         '<p class="s-lede">TRS is an insurance brokerage business.</p></div>'
         '<div class="s-hr"><p>TRS places property, liability, cyber and workforce cover with 18 Singapore-licensed insurers, then runs the policies, claims and renewals for each client with one named team.</p>'
         + ctas() + '</div></div></section>'
         '<div class="s-w"><div class="s-sky"><img src="/images/skyline-sg.jpg" alt="Singapore skyline with Marina Bay Sands and the Singapore Flyer at dusk" fetchpriority="high"></div></div>'
         '<section class="s-w"><div class="s-vn">'
         '<div><p class="s-vn-l s-vn-big-l">Premium saved through programme reviews</p><p class="s-vn-big">$10M+</p></div>'
         '<div><p class="s-vn-l">Clients served</p><p class="s-vn-n">250+</p></div>'
         '<div><p class="s-vn-l">Average saving on premium*</p><p class="s-vn-n">15%</p></div>'
         '<p class="s-vn-note"><b>Note</b>: figures in SGD. *Average across clients who moved their programme to TRS from a previous broker.</p></div>'
         '<div class="s-logos">' + ''.join(f'<img src="/logos/clients/{n}.png" alt="{e(a)}" style="height:{h}px" loading="lazy">' for n, a, h in LOGOS) + '</div></section>')
    b += ('<section class="s-sec"><div class="s-w"><h2 class="s-h2">Why leading companies trust TRS</h2><p class="s-sub">TRS runs the insurance programme for the business, from the first review to every claim after it.</p>'
          '<div class="s-wwd"><div class="s-wwd-pic"><img src="/images/industries/professional-services.jpg" alt="" loading="lazy"></div><div class="s-wwd-l">'
          '<div><h3>Dedicated risk management team</h3><p>A named team with more than 50 years of combined experience in broking, underwriting and claims, assigned to each account from the first review to every renewal after it.</p></div>'
          '<div><h3>White-glove service</h3><p>TRS gathers the information, completes the proposal forms, negotiates with insurers and runs the claim. The business reviews and signs; TRS does the work in between.</p></div>'
          '<div><h3>Transparent pricing and review</h3><p>Quotes are set side by side with premium, deductibles and key exclusions in plain terms. Each programme is reviewed against the business as it stands, not as it stood last year.</p></div>'
          '</div></div></div></section>')
    b += ('<section class="s-sec s-tint"><div class="s-w"><h2 class="s-h2">Proven in action</h2><p class="s-sub">Turning great experiences into impactful savings.</p><div class="s-outs">'
          '<div class="s-oc"><span>Singapore-licensed insurers TRS places with</span><b>18</b></div>'
          '<div class="s-oc"><span>Years placing corporate programmes</span><b>15+</b></div>'
          '<div class="s-oc"><span>Comparative quotes and a policy binder</span><b>48h</b></div></div></div></section>')
    b += ('<section class="s-sec" id="services"><div class="s-w"><h2 class="s-h2">Get the right insurance for you</h2><p class="s-sub">TRS structures cover around the risk profile of the business and places it with 18 Singapore-licensed insurers.</p><div class="s-north">'
          + ''.join(f'<a class="s-ni" href="/{p}/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="{ic}"/></svg><h3>{e(t)}</h3><p>{e(d)}</p></a>' for t, p, d, ic in SERVICES)
          + '</div></div></section>')
    cards = ''.join(f'<div class="s-cr-c" data-i="{i}"><a class="s-cr-img" href="/solutions/{s}/"><img src="/images/industries/{SOL[s][1]}" alt="" loading="lazy"><span class="s-tg">{e(SOL[s][0])}</span></a>'
                    f'<div class="s-cr-t"><h3>{e(SOL[s][0])}</h3><p>{e(SOL[s][2])}</p><a href="/solutions/{s}/">See more &rarr;</a></div></div>' for i, s in enumerate(SOL_ORDER))
    b += ('<section class="s-sec s-cr" id="solutions"><div class="s-w s-cr-head"><p class="s-eb">Deep domain expertise</p><h2 class="s-h2">Protecting businesses across industries</h2>'
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
