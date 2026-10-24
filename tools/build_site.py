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
          '<div class="s-wwd"><div class="s-wwd-pic"><img src="/images/why-trs.jpg" alt="A TRS broker reviewing a policy schedule with a client" loading="lazy" width="1400" height="1400"></div><div class="s-wwd-l">'
          '<div><h3>Dedicated risk management team</h3><p>A named team with more than 50 years of combined experience in broking, underwriting and claims, assigned to each account from the first review to every renewal after it.</p></div>'
          '<div><h3>White-glove service</h3><p>TRS gathers the information, completes the proposal forms, negotiates with insurers and runs the claim. The business reviews and signs; TRS does the work in between.</p></div>'
          '<div><h3>Transparent pricing and review</h3><p>Quotes are set side by side with premium, deductibles and key exclusions in plain terms. Each programme is reviewed against the business as it stands, not as it stood last year.</p></div>'
          '</div></div></div></section>')
    b += ('<section class="s-sec s-tint"><div class="s-w"><h2 class="s-h2">Proven in action</h2><p class="s-sub">Turning great experiences into impactful savings.</p><div class="s-outs s-outs-q">'
          '<figure class="s-oc s-q"><blockquote>&ldquo;The TRS team was professional from the first meeting. Their advice was transparent, so we could make the right decisions for the business with confidence.&rdquo;</blockquote><figcaption>Chief Financial Officer<span>TRS client</span></figcaption></figure>'
          '<div class="s-oc"><span>Saved in premiums for one client</span><b>$100K</b></div>'
          '<div class="s-oc"><span>From first review to a placed programme</span><b>14 days</b></div></div></div></section>')
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
    sec = f'<section class="s-sec s-related-reading"><div class="s-w"><p class="s-eb">Insights</p><h2 class="s-h2">Related reading</h2><div class="s-list" style="margin-top:32px">{links}</div></div></section>'
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
HOME_DESC = ('TRS is an insurance brokerage for businesses in Singapore. Property, liability, cyber and '
             'workforce cover placed with 18 Singapore-licensed insurers, run by one named team.')
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
