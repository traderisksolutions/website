#!/usr/bin/env python3
"""
1. Extract updated nav (without Resources / Claims) from index.html
2. Propagate to every HTML page
3. Rebuild all 9 solutions pages with the product-page layout
"""
import os, re, glob

ROOT = os.path.dirname(os.path.abspath(__file__))

# ─── STEP 1: Extract canonical nav from index.html ────────────────────────────
with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
    index_html = f.read()

nav_match = (
    re.search(r'(  <header class="nav">.*?  </aside>)', index_html, re.DOTALL) or
    re.search(r'(<header class="nav">.*?</aside>)', index_html, re.DOTALL)
)
if not nav_match:
    raise RuntimeError("Could not extract nav from index.html")
canonical_nav = nav_match.group(1)
print(f"Extracted nav ({len(canonical_nav)} chars)")

# ─── STEP 2: Propagate to all pages ───────────────────────────────────────────
patterns = [
    r'(  <header class="nav">.*?  </aside>)',
    r'(<header class="nav">.*?</aside>)',
    r'(  <header class="nav">.*?  </header>)',
    r'(<header class="nav">.*?</header>)',
]

skip_files = {os.path.join(ROOT, 'index.html')}
all_html = glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)
all_html = [f for f in all_html if f not in skip_files and 'node_modules' not in f and 'dashboard' not in f]

updated = skipped = 0
for filepath in all_html:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    old_nav = None
    for pat in patterns:
        m = re.search(pat, content, re.DOTALL)
        if m:
            old_nav = m.group(1)
            break
    if old_nav is None:
        print(f"  SKIP (no nav found): {os.path.relpath(filepath, ROOT)}")
        skipped += 1
        continue
    new_content = content.replace(old_nav, canonical_nav, 1)
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        updated += 1
    else:
        skipped += 1

print(f"Nav propagation: updated {updated} files, skipped {skipped}")

# ─── STEP 3: Rebuild solutions pages ──────────────────────────────────────────
FOOTER = '''  <footer class="site-footer">
    <div class="footer-wrap">
      <a href="/" class="footer-logo" aria-label="Trade Risk Solutions home">
        <span class="footer-logo-text">TRS</span>
      </a>
      <div class="footer-contact">
        <a href="tel:+6562380888" class="footer-link">+65 6238 0888</a>
        <a href="mailto:enquiry@trade-risksol.com" class="footer-link">enquiry@trade-risksol.com</a>
        <address class="footer-address">
          Suntec Tower 2, 9 Temasek Boulevard<br>Singapore 038989
        </address>
      </div>
      <p class="footer-copy">&copy; 2025 Trade Risk Solutions. All rights reserved.</p>
    </div>
  </footer>'''

def sol_page(title, meta_desc, eyebrow, heading, desc, cards):
    """cards = list of (icon_svg, title, body)"""
    cards_html = ''
    for svg, ctitle, cbody in cards:
        cards_html += f'''        <div class="ph-card">
          <div class="ph-card-icon">{svg}</div>
          <p class="ph-card-title">{ctitle}</p>
          <p class="ph-card-body">{cbody}</p>
        </div>\n'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — Trade Risk Solutions</title>
  <meta name="description" content="{meta_desc}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" /></noscript>
  <link rel="stylesheet" href="../../styles/main.css" />
  <link rel="stylesheet" href="../../styles/product.css" />
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>

NAV_PLACEHOLDER

  <!-- HERO -->
  <section class="ph-hero">
    <div class="ph-hero-inner">
      <div class="ph-left">
        <p class="ph-eyebrow">{eyebrow}</p>
        <h1 class="ph-heading">{heading}</h1>
        <a href="#" class="ph-btn" data-ctac-modal>
          Contact us
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
      <div class="ph-right">
        <p class="ph-desc">{desc}</p>
      </div>
    </div>
  </section>

  <!-- BENEFIT CARDS -->
  <section class="ph-cards-section">
    <div class="ph-cards-inner">
      <div class="ph-cards-grid">
{cards_html}      </div>
    </div>
  </section>

  <!-- FOOTER CTA -->
  <section class="footer-cta-section">
    <div class="footer-cta-wrap">
      <h2 class="footer-cta-heading">Find out what the right coverage looks like for you.</h2>
      <button class="footer-cta-btn" data-track="sol_contact_us" data-ctac-modal aria-label="Contact us">
        Contact us
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  </section>

FOOTER_PLACEHOLDER

  <script src="../../scripts/nav.js" defer></script>
</body>
</html>'''

# SVG icons (reusable)
SVG = {
    'shield':     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'briefcase':  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
    'users':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'refresh':    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    'cpu':        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    'lock':       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    'chart':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    'package':    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    'home':       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'truck':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    'heart':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    'code':       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    'wifi':       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
    'globe':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    'alert':      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'activity':   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'tool':       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    'dollar':     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    'map':        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
}

# Solutions data: slug → (title, meta_desc, eyebrow, heading, desc, cards)
SOLUTIONS = {
    'sme': (
        'SME Insurance Solutions',
        'TRS provides comprehensive insurance for Singapore SMEs — property, liability, workforce protection, and business continuity across all industries.',
        'Business Solutions',
        'Protect your growing business',
        'Comprehensive cover designed for Singapore SMEs — from protecting your premises and stock to keeping your team and customers covered. We place across 18+ carriers so you get the right terms at the right price.',
        [
            (SVG['home'],      'Property &amp; Assets', 'Commercial fire, contents, and equipment cover for your premises, machinery, and stock against loss or damage.'),
            (SVG['shield'],    'Liability Cover', 'Public liability, employers\' liability, and product liability protection for your day-to-day business operations.'),
            (SVG['users'],     'Workforce Protection', 'WICA, foreign worker medical, and group health insurance to meet statutory obligations and attract quality staff.'),
            (SVG['refresh'],   'Business Continuity', 'Business interruption and revenue protection cover to keep your cash flow stable following an insured event.'),
        ]
    ),
    'startups': (
        'Startup Insurance Solutions',
        'Insurance designed for high-growth companies — from seed to scale. TRS covers founders, teams, data, and investor liability across Singapore.',
        'Startup Solutions',
        'Insurance built for high-growth companies',
        'From your first hire to your Series B round, your risk profile evolves quickly. We help founders and CFOs stay ahead of coverage gaps — tech E&O, D&O, cyber, and employee benefits structured for how startups actually operate.',
        [
            (SVG['briefcase'], 'D&amp;O &amp; Management Liability', 'Protection for directors and officers against claims from investors, regulators, and employees arising from management decisions.'),
            (SVG['lock'],      'Cyber Insurance', 'Coverage for data breaches, ransomware, and business interruption arising from cyber incidents — mandatory for many enterprise deals.'),
            (SVG['code'],      'Professional Indemnity', 'Errors &amp; omissions cover for software, consulting, and advisory businesses against claims from clients for negligent service.'),
            (SVG['heart'],     'Group Medical &amp; Benefits', 'Scalable group health and employee benefits packages that help early-stage companies compete for talent.'),
        ]
    ),
    'cybersecurity': (
        'Cybersecurity Insurance',
        'TRS places cyber insurance for tech companies, financial services, and enterprises in Singapore — covering breaches, ransomware, and regulatory fines.',
        'Technology Solutions',
        'Cyber coverage for tech-driven businesses',
        'Cyber incidents are no longer a question of if, but when. TRS structures cyber insurance that responds to first-party losses, third-party claims, and regulatory investigations — across Singapore\'s MAS-regulated environment.',
        [
            (SVG['lock'],      'First-Party Cyber Loss', 'Covers your own losses from data breaches, ransomware payments, forensic investigation costs, and business interruption.'),
            (SVG['alert'],     'Third-Party Liability', 'Protects against claims from customers and partners arising from a failure to protect their personal or financial data.'),
            (SVG['dollar'],    'Regulatory Fines &amp; Penalties', 'Covers regulatory investigation costs and fines from the PDPC and other Singapore regulators following a data incident.'),
            (SVG['refresh'],   'Incident Response', 'Access to a panel of forensic, legal, and PR specialists to manage and contain a cyber event from the moment it is discovered.'),
        ]
    ),
    'ecommerce': (
        'E-Commerce Insurance Solutions',
        'Insurance for Singapore e-commerce businesses — covering inventory, product liability, cyber risk, and embedded purchase protection at checkout.',
        'Digital Commerce',
        'Coverage built for online retailers',
        'E-commerce businesses face a unique mix of physical and digital risks — from warehouse fire to payment fraud to product liability claims. TRS places cover across all of them, with embedded distribution options for platforms at scale.',
        [
            (SVG['package'],   'Stock &amp; Inventory', 'Coverage for your goods in storage, in transit, and during last-mile delivery — including theft, accidental damage, and flood.'),
            (SVG['shield'],    'Product Liability', 'Protection against claims from customers who suffer injury or loss from defective products sold through your platform.'),
            (SVG['lock'],      'Cyber &amp; Fraud', 'Covers losses from payment fraud, data breaches, and ransomware attacks targeting your platform or customer data.'),
            (SVG['refresh'],   'Business Interruption', 'Revenue protection when a covered event — fire, flood, or cyber incident — forces your operations offline.'),
        ]
    ),
    'fintech': (
        'FinTech Insurance Solutions',
        'Insurance for fintech companies, digital banks, and payment platforms in Singapore — D&O, professional indemnity, cyber, and embedded product options.',
        'Financial Services',
        'Insurance for fintech and digital finance',
        'Fintech companies operate at the intersection of technology, financial services, and regulation. TRS helps you manage regulatory risk, protect your leadership team, and embed insurance directly into your product where it adds the most value.',
        [
            (SVG['briefcase'], 'D&amp;O Liability', 'Protects directors and officers against personal liability arising from regulatory investigations, investor claims, or MAS enforcement actions.'),
            (SVG['code'],      'Professional Indemnity', 'Covers claims from clients or partners arising from errors, omissions, or failures in your financial technology services.'),
            (SVG['lock'],      'Cyber Insurance', 'First- and third-party cyber coverage for breaches, fraud, and ransomware — with regulatory defence costs included.'),
            (SVG['dollar'],    'Embedded Insurance Products', 'Distribute TRS-backed insurance products — credit protection, travel, and PA — directly through your platform to your customers.'),
        ]
    ),
    'technology': (
        'Technology Insurance Solutions',
        'Insurance for software companies, SaaS businesses, and tech consultancies in Singapore — covering PI, D&O, cyber, and employee benefits.',
        'Technology &amp; SaaS',
        'Technology insurance for software companies',
        'Software companies carry outsized liability relative to their physical footprint. A single professional indemnity claim or data breach can dwarf annual revenue. TRS structures coverage that matches how tech businesses actually operate — lean teams, global clients, and high IP exposure.',
        [
            (SVG['code'],      'Tech Professional Indemnity', 'Covers claims from clients arising from software defects, project delays, or failure of your technology to perform as specified.'),
            (SVG['lock'],      'Cyber &amp; Data', 'Protects against first-party cyber losses and third-party claims from customers affected by a breach of your systems or data.'),
            (SVG['briefcase'], 'D&amp;O &amp; Management Liability', 'Protects founders, directors, and senior executives from personal liability arising from business decisions or investor disputes.'),
            (SVG['users'],     'Group Medical &amp; Benefits', 'Competitive group health and benefits packages designed to help tech companies attract and retain engineering talent.'),
        ]
    ),
    'healthcare': (
        'Healthcare Insurance Solutions',
        'Insurance for healthcare providers, medical device companies, and life sciences businesses in Singapore — covering medical malpractice, product liability, and cyber.',
        'Healthcare &amp; Life Sciences',
        'Insurance for healthcare and life sciences',
        'Healthcare organisations face regulatory scrutiny, patient safety obligations, and high-value equipment risk simultaneously. TRS structures cover across clinical, operational, and cyber exposures — drawing from insurers with deep healthcare experience.',
        [
            (SVG['activity'],  'Medical Malpractice', 'Protects clinicians and healthcare organisations against claims arising from alleged errors or omissions in patient care.'),
            (SVG['package'],   'Medical Device &amp; Product Liability', 'Covers claims arising from injury or loss caused by defective medical devices, pharmaceuticals, or life science products.'),
            (SVG['lock'],      'Healthcare Cyber', 'Protects patient data and clinical systems from ransomware, breaches, and regulatory fines — with specialist healthcare response teams.'),
            (SVG['tool'],      'Clinical Equipment', 'All-risk cover for high-value diagnostic and surgical equipment — including accidental damage, breakdown, and transit.'),
        ]
    ),
    'logistics': (
        'Logistics Insurance Solutions',
        'Insurance for logistics, freight, and supply chain companies in Singapore — covering marine cargo, liability, fleet, and warehouse stock.',
        'Logistics &amp; Supply Chain',
        'Coverage for logistics and freight companies',
        'Logistics businesses carry liability at every node of the supply chain — from the warehouse to the vessel to the final mile. TRS places cover across the full cargo journey, fleet operations, and third-party liability, structured for Singapore\'s role as a major trade hub.',
        [
            (SVG['truck'],     'Marine Cargo &amp; Inland Transit', 'All-risk cargo cover from origin to destination — including sea, air, road, and rail — with single-transit and open-policy options.'),
            (SVG['map'],       'Freight Liability', 'Covers liability to cargo owners arising from loss or damage in your care, custody, or control as a freight forwarder or carrier.'),
            (SVG['home'],      'Warehouse &amp; Stock', 'Protection for goods in storage against fire, flood, theft, and accidental damage — including customer-owned stock.'),
            (SVG['shield'],    'Fleet &amp; Third-Party Liability', 'Comprehensive or third-party motor coverage for delivery vehicles, forklifts, and heavy goods vehicles across your fleet.'),
        ]
    ),
    'construction': (
        'Construction Insurance Solutions',
        'Insurance for construction companies, property developers, and built environment businesses in Singapore — covering CAR, liability, equipment, and professional risk.',
        'Built Environment',
        'Insurance for construction and real estate',
        'Construction projects carry concentrated risk across a compressed timeframe — contractor liability, equipment breakdown, worker injury, and professional errors can all surface simultaneously. TRS places cover across the full project lifecycle and holds relationships with specialist construction underwriters.',
        [
            (SVG['tool'],      "Contractors' All Risks (CAR)", 'All-risk cover for works under construction — materials, temporary structures, and third-party property damage during the project period.'),
            (SVG['users'],     'Work Injury Compensation', 'Statutory WICA insurance for workers on site, covering medical expenses and compensation for work-related injuries or death.'),
            (SVG['activity'],  'Plant &amp; Equipment', 'Cover for construction machinery, mobile plant, and electronic equipment against accidental damage, theft, and breakdown on site.'),
            (SVG['briefcase'], 'Professional Indemnity', 'Protects architects, engineers, and project managers against claims arising from design errors or professional negligence.'),
        ]
    ),
}

for slug, data in SOLUTIONS.items():
    path = os.path.join(ROOT, 'solutions', slug, 'index.html')
    if not os.path.exists(os.path.dirname(path)):
        print(f"  SKIP (dir missing): solutions/{slug}")
        continue

    # Read the file to get the current nav
    with open(path, 'r', encoding='utf-8') as f:
        old_content = f.read()

    # Extract current nav from this file
    old_nav = None
    for pat in patterns:
        m = re.search(pat, old_content, re.DOTALL)
        if m:
            old_nav = m.group(1)
            break

    title, meta_desc, eyebrow, heading, desc, cards = data
    new_html = sol_page(title, meta_desc, eyebrow, heading, desc, cards)
    new_html = new_html.replace('NAV_PLACEHOLDER', canonical_nav)
    new_html = new_html.replace('FOOTER_PLACEHOLDER', FOOTER)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    print(f"  Built: solutions/{slug}/index.html")

print("Done.")
