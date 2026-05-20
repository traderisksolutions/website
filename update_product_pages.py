#!/usr/bin/env python3
"""Update all product pages with new copy, create new pages, fix nav links, propagate nav."""
import os, re, shutil

BASE = '/Users/jarodhong-macbookpro-m5/trs-website'

SVGS = {
    'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'tool': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'users': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'dollar': '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'globe': '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    'lock': '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    'alert': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    'truck': '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    'file': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'anchor': '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
    'box': '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    'cpu': '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    'wifi': '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    'layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'award': '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    'package': '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
}

def icon(name, size=22):
    p = SVGS.get(name, SVGS['shield'])
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{p}</svg>'

def cards_html(cards):
    html = ''
    for (title, body, ico) in cards:
        html += f'''        <div class="ph-card">
          <div class="ph-card-icon">{icon(ico)}</div>
          <p class="ph-card-title">{title}</p>
          <p class="ph-card-body">{body}</p>
        </div>
'''
    return html.rstrip()

# --- PAGE DATA ---
PAGES = {
    'personal/home-contents': {
        'title': 'Home Contents Insurance — TRS Personal',
        'eyebrow': 'Personal Insurance',
        'heading': 'Protect what matters at home',
        'desc': 'Comprehensive home contents insurance covering your furniture, electronics, clothing, and valuables against fire, theft, water damage, and accidental loss.',
        'cards': [
            ('Contents Cover', 'Furniture, appliances, electronics, clothing, and personal belongings, insured for replacement at today\'s prices.', 'home'),
            ('Renovation Cover', 'Fixtures, fittings, and improvements you\'ve paid for. Covered up to the renovation sum you specify.', 'tool'),
            ('Domestic Helper Liability', 'Protection against legal claims arising from accidents caused by your domestic worker within the home.', 'users'),
            ('Temporary Accommodation', 'Hotel and temporary rental costs if your home becomes uninhabitable following a covered event.', 'briefcase'),
        ],
    },
    'personal/fire': {
        'title': 'Fire Insurance — TRS Personal',
        'eyebrow': 'Personal Insurance',
        'heading': 'Safeguard your property\'s foundation',
        'desc': 'Essential coverage designed to protect your physical property\'s internal structure, original fixtures, and fittings against unexpected fire damage, explosions, and severe weather events.',
        'cards': [
            ('Building Structure', 'Financial protection to rebuild or repair the physical walls, floors, and ceilings of your property following an insured event.', 'home'),
            ('Original Fixtures &amp; Fittings', 'Coverage for built-in wardrobes, flooring, and kitchen counters originally provided by the developer or HDB.', 'tool'),
            ('Debris Removal Expenses', 'Covers the cost of clearing structural debris and site clean-up required before any reinstatement or reconstruction can begin.', 'alert'),
            ('Alternative Living Costs', 'Immediate financial support for emergency living expenses if a fire renders your primary residence structurally unsafe.', 'briefcase'),
        ],
    },
    'personal/maid': {
        'title': 'Maid Insurance — TRS Personal',
        'eyebrow': 'Personal Insurance',
        'heading': 'Care for those who care for your home',
        'desc': 'Comprehensive coverage that fulfills regulatory requirements while protecting your household helper\'s medical well-being and safeguarding your family against unexpected liabilities.',
        'cards': [
            ('MOM Security Bond &amp; Letter', 'Direct issuance of the mandatory $5,000 letter of guarantee to the Ministry of Manpower on your behalf.', 'file'),
            ('Hospital &amp; Surgical Coverage', 'High-limit inpatient medical care, day surgery, and pre/post-hospitalization expense coverage to safeguard your helper\'s health.', 'heart'),
            ('Wages &amp; Levy Reimbursement', 'Financial compensation for your helper\'s salary and the monthly government levy during periods where she is hospitalized.', 'dollar'),
            ('Employer Liability Protection', 'Indemnifies your household against costly legal claims or common law lawsuits arising from workplace injuries or accidents.', 'shield'),
        ],
    },
    'personal/personal-accident': {
        'title': 'Personal Accident Insurance — TRS Personal',
        'eyebrow': 'Personal Insurance',
        'heading': 'Prepared for life\'s unpredictable moments',
        'desc': 'A vital financial safety net providing a lump-sum payout and expense reimbursement in the event of accidental injury, disability, or unforeseen medical emergencies.',
        'cards': [
            ('Lump-Sum Disablement Payouts', 'Substantial financial support distributed according to a clear benefit schedule for accidental death or permanent disablement.', 'dollar'),
            ('Medical &amp; Outpatient Reimbursement', 'Full coverage for clinic visits, specialized treatments, diagnostic scans, and qualified physiotherapy resulting from an accident.', 'heart'),
            ('Daily Hospital Cash', 'A fixed daily cash benefit paid directly to you during hospital stays to supplement income and manage household expenses.', 'activity'),
            ('Infectious Disease Extension', 'Broadened protection that includes medical cost reimbursements if diagnosed with specified conditions like Dengue Fever or HFMD.', 'shield'),
        ],
    },
    'commercial/property': {
        'title': 'Industrial All Risks &amp; Fire Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Resilience for your operational infrastructure',
        'desc': 'All-risks operational protection designed for large scale enterprises, safeguarding your physical plants, machinery, and inventory against unexpected material damage, fires, and natural disasters.',
        'cards': [
            ('All-Risks Material Damage', 'Broad form coverage for accidental physical loss or destruction of building structures, factories, and warehouses.', 'home'),
            ('Machinery &amp; Equipment', 'Protection for high-value fixed assets, manufacturing equipment, and specialized plant machinery against operational perils.', 'tool'),
            ('Inventory &amp; Raw Materials', 'Safeguards your physical stock, raw materials, and work-in-progress inventory stored across your operating premises.', 'box'),
            ('Mitigation &amp; Clean-up Costs', 'Covers firefighting expenses, immediate damage mitigation, and debris removal required to secure the site post-incident.', 'alert'),
        ],
    },
    'commercial/revenue': {
        'title': 'Business Interruption Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Protect your revenue when operations pause',
        'desc': 'Vital financial continuity coverage that replaces lost income and covers ongoing fixed overheads when a physical disaster forces your business to temporarily halt operations.',
        'cards': [
            ('Gross Profit Protection', 'Indemnifies your business for the loss of net profit and turnover resulting from an insured physical disruption.', 'trending-up'),
            ('Standing Charges &amp; Fixed Costs', 'Continuous funding to cover essential ongoing expenses, including payroll, rent, taxes, and bank loan obligations.', 'dollar'),
            ('Increased Cost of Working', 'Coverage for emergency expenses incurred to minimize downtime, such as renting temporary offices or outsourcing production.', 'activity'),
            ('Interdependent Supply Chain Cover', 'Extended protection covering revenue losses caused by disruptions at a critical customer\'s or supplier\'s facility.', 'link'),
        ],
    },
    'commercial/car': {
        'title': 'Contractors\' All Risks Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'End-to-end security for capital projects',
        'desc': 'Comprehensive protection for civil engineering and construction projects, covering both physical damage to the works and third-party liability claims from groundbreaking to handover.',
        'cards': [
            ('Contract Works Cover', 'Full material damage protection for the permanent and temporary works, including raw construction materials onsite.', 'home'),
            ('Plant &amp; Equipment Protection', 'Insures onsite construction machinery, cranes, tools, and site huts against theft, vandalism, and accidental damage.', 'tool'),
            ('Third-Party Civil Liability', 'Shields the project against legal liability for accidental bodily injury or property damage caused to members of the public.', 'shield'),
            ('Maintenance Period Extension', 'Extended coverage for physical losses or defects that arise during the contractual post-construction maintenance phase.', 'check-circle'),
        ],
    },
    'commercial/equipment': {
        'title': 'Machinery Breakdown Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Minimize the cost of mechanical failure',
        'desc': 'Specialized operational insurance covering the sudden and accidental physical breakdown of critical internal machinery, electrical plants, and production systems.',
        'cards': [
            ('Internal Mechanical Breakdown', 'Covers the cost of repairing or replacing machinery following internal failures, such as casting fractures or centrifugal disruptions.', 'tool'),
            ('Electrical Short-Circuits', 'Protection against sudden electrical damage, including power surges, insulation failures, and accidental short-circuiting.', 'zap'),
            ('Physical Entry of Foreign Bodies', 'Coverage for severe internal damage caused by the accidental introduction of foreign objects into moving machinery parts.', 'alert'),
            ('Dismantling &amp; Re-erection Costs', 'Funds the specialized labor required to dismantle, transport, repair, and reinstall heavy industrial components.', 'activity'),
        ],
    },
    'commercial/electronic-equipment': {
        'title': 'Electronic Equipment Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Guard your critical digital infrastructure',
        'desc': 'All-risks protection tailored for high-value corporate electronic systems, data processing units, and specialized medical or lab equipment against sudden physical loss.',
        'cards': [
            ('Hardware Material Damage', 'Coverage for physical damage to servers, networking hardware, control systems, and diagnostic equipment from any external cause.', 'cpu'),
            ('Data Media Restoration', 'Reimburses the direct costs of reconstructing lost operating systems, proprietary software, and essential corporate databases.', 'database'),
            ('Increased Cost of Operations', 'Funds emergency backup systems, external data center hosting, and temporary equipment rentals during primary system downtime.', 'activity'),
            ('Voltage Fluctuation Protection', 'Specialized underwriting that shields sensitive microprocessor-based hardware from subtle power grid spikes and surges.', 'zap'),
        ],
    },
    'commercial/inventory': {
        'title': 'Marine Cargo Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Seamless protection across global transit corridors',
        'desc': 'Classic international transit coverage safeguarding merchandise, commodities, and cargo while transported via ocean vessels, air freight, or international road networks.',
        'cards': [
            ('Institute Cargo Clauses (A)', 'The highest tier of "All Risks" transit coverage, shielding cargo against theft, non-delivery, handling damage, and heavy weather.', 'anchor'),
            ('General Average Contributions', 'Covers mandatory financial contributions legally assessed against cargo owners during maritime emergencies and vessel salvage.', 'layers'),
            ('Loading &amp; Unloading Exposure', 'Protection extending to physical damage sustained during transit handovers, crane transfers, and portside container handling.', 'truck'),
            ('Consequential Port Expenses', 'Coverage for unexpected warehousing, re-routing, and temporary storage fees resulting from a disrupted maritime voyage.', 'briefcase'),
        ],
    },
    'commercial/stock-throughput': {
        'title': 'Stock Throughput Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Unified supply chain asset protection',
        'desc': 'A highly efficient, single-policy marine structure that continuously covers inventory worldwide across its entire lifecycle — from raw materials in transit, through processing, to static warehouse storage.',
        'cards': [
            ('Elimination of Insurance Gaps', 'Continuous end-to-end coverage that removes the dangerous boundaries between separate transit and property storage policies.', 'link'),
            ('Global Static Storage Cover', 'Protects your raw inventory, work-in-progress, and finished goods while held in owned or third-party logistics (3PL) warehouses.', 'database'),
            ('Favorable Marine Deductibles', 'Access to fixed marine deductibles for catastrophic perils (flood, windstorm) that are often significantly lower than standard property policy terms.', 'trending-up'),
            ('Selling Price Valuation', 'Claims settlement options structured around the actual selling price of finished goods, rather than basic manufacturing cost.', 'dollar'),
        ],
    },
    'commercial/inland-transit': {
        'title': 'Inland Transit Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Shielding domestic distribution networks',
        'desc': 'Targeted land-based transit insurance protecting goods and commodities while being distributed domestically via road, rail, or intermodal courier networks.',
        'cards': [
            ('Vehicular Accident Coverage', 'Protects your cargo from physical damage resulting from collisions, vehicle overturning, or transport derailments.', 'truck'),
            ('Transit Theft &amp; Hijacking', 'Robust protection against opportunistic theft, vehicle break-ins, and coordinated cargo hijacking while en route.', 'lock'),
            ('Intermediate Depots &amp; Storage', 'Incidental coverage for goods temporarily offloaded or held overnight at domestic sorting hubs and cross-docking facilities.', 'box'),
            ('Earned Freight Protection', 'Covers lost shipping revenues or contract penalties if goods cannot be delivered to the final consignee due to a transit incident.', 'dollar'),
        ],
    },
    'commercial/financial-assets': {
        'title': 'Trade Credit Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Insure your accounts receivable against insolvency',
        'desc': 'Strategic financial protection that shields your cash flow against commercial bad debt, corporate insolvency, or protracted payment defaults by your B2B buyers.',
        'cards': [
            ('Insolvency Protection', 'Immediate indemnification of outstanding invoices if a major commercial client enters corporate liquidation or bankruptcy.', 'shield'),
            ('Protracted Default Recovery', 'Financial backup when corporate buyers fail to settle valid, undisputed invoices within the agreed credit period.', 'clock'),
            ('Political Risk Extensions', 'Safeguards cross-border receivables against government moratoria, currency transfer restrictions, or unexpected import/export bans.', 'globe'),
            ('Credit Intelligence &amp; Monitoring', 'Active credit risk assessments and real-time monitoring of your buyers\' financial health to prevent bad debt exposure.', 'eye'),
        ],
    },
    'commercial/surety-bonds': {
        'title': 'Surety Bonds Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Backing your contractual performance commitments',
        'desc': 'Institutional guarantees issued to project owners to verify that your business will fully execute its contractual obligations, bidding terms, and statutory requirements.',
        'cards': [
            ('Performance Bonds', 'Guarantees to project developers that construction works or corporate services will be completed in strict accordance with contract terms.', 'check-circle'),
            ('Bid &amp; Tender Bonds', 'Validates that your firm will enter into the contract and provide the necessary final bonds if awarded a commercial tender.', 'file'),
            ('Advance Payment Bonds', 'Secures upfront mobilization funds advanced by a developer, ensuring the capital is used exclusively for the designated project.', 'dollar'),
            ('Qualifying Financial Security', 'High-standing financial guarantees accepted by statutory boards and major corporate clients in place of tied-up cash deposits.', 'award'),
        ],
    },
    'commercial/motor': {
        'title': 'Commercial Vehicle Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Protect the fleet that drives your enterprise',
        'desc': 'Robust fleet and single vehicle insurance designed to protect commercial vans, trucks, and company cars against accidental damage, theft, and heavy third-party liability.',
        'cards': [
            ('Comprehensive Fleet Damage', 'Full coverage for own vehicle repair or replacement costs following road accidents, fires, vandalism, or malicious damage.', 'truck'),
            ('Unlimited Third-Party Liability', 'Complete legal protection against unlimited third-party bodily injury claims and high-limit property damage arising from fleet operations.', 'shield'),
            ('Load &amp; Goods-in-Transit Alignment', 'Built to interface seamlessly with cargo insurance, protecting vehicle assets alongside operational logistics.', 'link'),
            ('24/7 Commercial Roadside Recovery', 'Specialized towing and rapid roadside assistance for heavy commercial vehicles to minimize logistics downtime.', 'activity'),
        ],
    },
    'commercial/core-liability': {
        'title': 'General Comprehensive Liability Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Corporate protection against external claims',
        'desc': 'Fundamental liability coverage safeguarding your enterprise against costly lawsuits stemming from accidental third-party bodily injury or property damage occurring during your business activities.',
        'cards': [
            ('Public &amp; Premises Liability', 'Protects your business if a visitor, client, or vendor suffers an accidental injury on your corporate premises or project sites.', 'users'),
            ('Products &amp; Completed Operations', 'Indemnifies your firm against legal claims alleging bodily injury or property damage caused by a product you manufactured, sold, or distributed.', 'package'),
            ('Defective Workmanship Liability', 'Coverage for legal liabilities arising from property damage caused by your operational services or completed contracts.', 'tool'),
            ('Worldwide Jurisdiction Defense', 'Covers the immense legal fees, court costs, and court-ordered settlements associated with defending major corporate lawsuits.', 'globe'),
        ],
    },
    'commercial/imi': {
        'title': 'Investment Management Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Unified liability shield for asset managers',
        'desc': 'A specialized, high-tier package combining Professional Indemnity, Directors &amp; Officers (D&amp;O) Liability, and Crime protection specifically for investment managers, funds, and advisors.',
        'cards': [
            ('Breach of Investment Mandate', 'Protects the firm against civil liability and investor lawsuits alleging negligent asset allocation or deviations from fund mandates.', 'target'),
            ('Fiduciary Liability Defense', 'Coverage for allegations of breaches of fiduciary duty, mismanagement of fund assets, or regulatory non-compliance.', 'shield'),
            ('Fund &amp; Subsidiary D&amp;O', 'Ring-fenced management liability protection for directors, partners, and investment committee members managing in-house funds.', 'briefcase'),
            ('Commercial Crime &amp; Fraud Protection', 'Optional or integrated coverage protecting fund assets against direct losses from employee embezzlement, forgery, or external theft.', 'lock'),
        ],
    },
    'commercial/medical-malpractice': {
        'title': 'Medical Malpractice Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Safeguard your clinical reputation and practice',
        'desc': 'Critical professional liability protection for healthcare institutions, clinics, and medical practitioners against claims alleging clinical negligence, errors, or omissions.',
        'cards': [
            ('Clinical Negligence Defense', 'Full legal defense and indemnity against claims alleging misdiagnosis, surgical errors, or treatment mismanagement.', 'shield'),
            ('Good Samaritan Acts', 'Extends liability protection to medical professionals providing emergency first-aid or medical assistance outside their standard practice.', 'heart'),
            ('Regulatory &amp; Disciplinary Representation', 'Funds legal representation before medical councils, statutory boards, and professional disciplinary inquiries.', 'briefcase'),
            ('Patient Record Confidentiality', 'Covers legal defense and damages associated with accidental breaches of sensitive patient data or medical records.', 'lock'),
        ],
    },
    'commercial/dao': {
        'title': 'Directors &amp; Officers Liability Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Protect personal assets against corporate decisions',
        'desc': 'Premium management liability insurance designed to protect the personal assets of corporate board members, executives, and senior managers against lawsuits alleging wrongful acts.',
        'cards': [
            ('Personal Asset Protection (Side A)', 'Direct, non-indemnifiable coverage protecting directors\' personal wealth when the company is legally or financially unable to back them.', 'shield'),
            ('Regulatory Investigation Cost', 'Advances legal defense fees for official investigations, statutory inquiries, or dawn raids conducted by financial regulators.', 'eye'),
            ('Shareholder &amp; Stakeholder Lawsuits', 'Shields executives from claims alleging mismanagement, breaches of duty, or misleading statements that impact corporate value.', 'users'),
            ('Employment Practices Liability', 'Protects directors and the entity from internal claims alleging unfair dismissal, workplace discrimination, or harassment.', 'briefcase'),
        ],
    },
    'commercial/professional': {
        'title': 'Professional Indemnity Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Defend your expertise and professional advice',
        'desc': 'Essential liability protection for consultants, engineers, and tech providers, covering financial losses suffered by clients due to alleged professional errors, omissions, or advice.',
        'cards': [
            ('Errors &amp; Omissions (E&amp;O)', 'Protection against claims of professional negligence, inaccurate advice, or design mistakes that cause a client financial loss.', 'alert'),
            ('Breach of Confidentiality', 'Indemnifies your firm against legal actions stemming from accidental leaks of sensitive client data or proprietary intellectual property.', 'lock'),
            ('Defamation &amp; Libel Cover', 'Covers legal defense costs if a client or competitor alleges professional slander, libel, or unintentional plagiarism.', 'file'),
            ('Fee Dispute Defense', 'Helps manage situations where a client refuses to pay your professional fees, counter-claiming professional negligence or project failure.', 'dollar'),
        ],
    },
    'commercial/cyber': {
        'title': 'Cyber Insurance — TRS Commercial',
        'eyebrow': 'Commercial Insurance',
        'heading': 'Resilience against digital disruptions and breaches',
        'desc': 'Comprehensive enterprise protection covering first-party response costs and third-party liabilities stemming from data breaches, ransomware attacks, and systemic network outages.',
        'cards': [
            ('Ransomware &amp; Extortion Response', 'Immediate access to specialized cyber-incident response teams, forensic investigators, and legal advisors to resolve ransom demands.', 'lock'),
            ('Business Interruption Loss', 'Replaces lost operational net profit and covers extra expenses if a cyberattack or system failure takes your digital networks offline.', 'zap'),
            ('Privacy Liability &amp; Regulatory Fines', 'Pays for legal defense, class-action settlements, and statutory penalties resulting from corporate data privacy breaches (e.g., PDPA).', 'shield'),
            ('Digital Asset Restoration', 'Reimburses the technical costs required to safely decontaminate, rebuild, and restore your corrupted corporate databases and software systems.', 'database'),
        ],
    },
    'commercial/workmen': {
        'title': 'Work Injury Compensation Insurance — TRS Workforce',
        'eyebrow': 'Workforce Insurance',
        'heading': 'Strict statutory compliance, absolute workforce security',
        'desc': 'Mandatory, legislation-backed protection that fulfills Singapore Ministry of Manpower (MOM) directives, shielding your business from costly liability claims while ensuring fair compensation for employee workplace injuries.',
        'cards': [
            ('Statutory Medical Expenses', 'Full coverage for hospital bills, medical treatments, and rehabilitation costs resulting from a workplace accident, up to statutory limits.', 'heart'),
            ('Medical Leave Wages', 'Reimburses your business for the legal wages paid to an injured employee during their temporary outpatient or hospitalization medical leave.', 'dollar'),
            ('Lump-Sum Disablement Payouts', 'Provides fixed, mandatory financial payouts to employees or their beneficiaries in the event of permanent disablement or accidental death.', 'shield'),
            ('Common Law Defense', 'Shields your enterprise against high-stakes lawsuits filed by employees under common law outside the standard WICA framework.', 'briefcase'),
        ],
    },
    'commercial/foreign-worker': {
        'title': 'Foreign Worker Medical Insurance — TRS Workforce',
        'eyebrow': 'Workforce Insurance',
        'heading': 'Essential healthcare protection for your global crew',
        'desc': 'Fully compliant, mandatory medical coverage designed to safeguard the health of your Work Permit and S Pass holders, meeting the latest enhanced MOM minimum caps.',
        'cards': [
            ('Enhanced Hospitalization Limits', 'High-limit inpatient and day surgery coverage, structured to fully absorb the escalating costs of major medical care.', 'heart'),
            ('Co-Insurance Safeguards', 'Optimized structures to manage corporate co-payment shares, keeping premiums predictable while maintaining regulatory compliance.', 'shield'),
            ('Pre &amp; Post-Hospitalization Care', 'Coverage extending to specialist consultations, diagnostic tests, and follow-up treatments before and after an inpatient stay.', 'activity'),
            ('Direct Billing Networks', 'Access to extensive panel hospital networks across Singapore, ensuring hassle-free admissions with zero out-of-pocket delays for your firm.', 'link'),
        ],
    },
    'commercial/foreign-worker-bond': {
        'title': 'Foreign Worker Bond Insurance — TRS Workforce',
        'eyebrow': 'Workforce Insurance',
        'heading': 'Seamless statutory guarantees for non-local talent',
        'desc': 'An efficient, cash-free alternative to the mandatory Ministry of Manpower security bond required for hiring non-Malaysian work permit holders.',
        'cards': [
            ('MOM Letter of Guarantee', 'Direct, immediate electronic filing of the required $5,000 security bond to the Ministry of Manpower on your behalf.', 'file'),
            ('Capital Liquidity Optimization', 'Frees up vital operational cash flow by replacing tied-up bank guarantees or physical cash deposits with a low-premium insurance bond.', 'dollar'),
            ('Optional Counter-Indemnity Waivers', 'Access to structured premium extensions that protect your business from sudden bond forfeitures caused by unexpected worker breaches.', 'shield'),
            ('Rapid Multi-Worker Processing', 'Scalable, bulk-issuance underwriting designed to handle high-volume onboarding for large industrial, marine, or construction workforces.', 'users'),
        ],
    },
    'employees/medical': {
        'title': 'Group Health Insurance — TRS Workforce',
        'eyebrow': 'Employee Benefits',
        'heading': 'Premium corporate healthcare for modern teams',
        'desc': 'Comprehensive group health and hospitalization frameworks designed to protect your human capital, elevate employee well-being, and drive corporate talent retention.',
        'cards': [
            ('Inpatient &amp; Surgical Limits', 'High-tier hospital room, board, and surgical fee coverage across private and public medical centers in Singapore.', 'heart'),
            ('Outpatient GP &amp; Specialist Care', 'Flexible riders covering daily clinic visits, general practitioners, and direct referrals to specialized medical consultants.', 'activity'),
            ('Pre-Existing Condition Cover', 'Strategic underwriting options that cover employees\' chronic or pre-existing medical conditions immediately upon policy inception.', 'check-circle'),
            ('Digital Wellness Integration', 'Seamless compatibility with corporate HR portals, telehealth apps, and digital claims tracking for modern employee self-service.', 'wifi'),
        ],
    },
    'employees/group-travel': {
        'title': 'Group Business Travel Insurance — TRS Workforce',
        'eyebrow': 'Employee Benefits',
        'heading': 'Continuous protection for your mobile workforce',
        'desc': 'Dedicated corporate travel insurance designed to protect your executives and employees during regional or international business trips, client meetings, and overseas deployments.',
        'cards': [
            ('Corporate Flight &amp; Baggage Delays', 'Direct financial reimbursement for missed flight connections, baggage delays, lost business equipment, and trip disruptions.', 'briefcase'),
            ('Global Emergency Evacuation', 'Immediate, 24/7 access to international medical transport and repatriation services for remote or critical emergencies abroad.', 'globe'),
            ('Alternative Executive Deployment', 'Covers the travel and accommodation costs of sending a replacement employee if an original traveler falls severely ill during an assignment.', 'users'),
            ('Leisure Extensions for Staff', 'Highly attractive policy variations that extend corporate-rate travel protection to employees during incidental leisure days attached to business trips.', 'heart'),
        ],
    },
    'employees/benefits': {
        'title': 'Employee Benefits Insurance — TRS Workforce',
        'eyebrow': 'Employee Benefits',
        'heading': 'Tailored, multi-tier corporate wellness packages',
        'desc': 'An all-in-one, highly flexible benefits matrix that consolidates life, accident, and medical covers into a single, cohesive package to give your firm a competitive edge in hiring.',
        'cards': [
            ('Group Term Life Insurance', 'Vital financial security providing a substantial tax-free lump-sum benefit to an employee\'s family in the event of death or terminal illness.', 'shield'),
            ('Group Personal Accident', 'Round-the-clock, worldwide coverage for accidental injuries, providing cash payouts for temporary or permanent disability.', 'activity'),
            ('Flexible Spending Accounts (FSA)', 'Structured frameworks allowing employees to allocate corporate wellness credits toward dental care, optical needs, or health screenings.', 'dollar'),
            ('Centralized Benefit Administration', 'Simplified corporate billing and account management, reducing administrative overhead for your HR and finance teams.', 'briefcase'),
        ],
    },
    'employees/dao': {
        'title': 'D&O Liability Insurance — TRS Workforce',
        'eyebrow': 'Executive Benefits',
        'heading': 'Insulate leadership assets against strategic risks',
        'desc': 'High-tier management liability protection designed to shield the personal wealth of your directors and C-suite executives against complex corporate lawsuits or regulatory investigations.',
        'cards': [
            ('Personal Asset Protection', 'Dedicated, uncompromised defense and settlement funding protecting a leader\'s personal home, savings, and investments.', 'shield'),
            ('Regulatory Defense Costs', 'Immediate advancement of legal fees required to respond to audits, statutory inquiries, or investigations by financial and trade authorities.', 'eye'),
            ('Shareholder &amp; Creditor Claims', 'Robust defense structures against allegations of breach of fiduciary duty, corporate mismanagement, or misleading operational disclosures.', 'users'),
            ('Employment Practices Liability (EPLI)', 'Fully covers the board and the corporate entity against high-profile executive claims alleging wrongful termination or discrimination.', 'briefcase'),
        ],
    },
    'employees/keyman': {
        'title': 'Keyman Insurance — TRS Workforce',
        'eyebrow': 'Executive Benefits',
        'heading': 'Guarantee institutional continuity when leadership is impacted',
        'desc': 'Strategic corporate life or critical illness protection taken out by the business on its most vital leaders, protecting the company\'s financial stability during a sudden leadership transition.',
        'cards': [
            ('Revenue Deficit Cushion', 'Provides an immediate, massive influx of corporate liquidity to offset lost profits, project delays, or disrupted client accounts.', 'trending-up'),
            ('Executive Headhunting Funds', 'Offsets the high recruitment and retention costs required to source, secure, and onboard a high-caliber replacement executive.', 'users'),
            ('Corporate Debt Stabilization', 'Assures banking institutions, venture capital partners, and creditors that the company\'s lines of credit remain financially backed.', 'dollar'),
            ('Shareholder Buyout Capital', 'Provides the exact liquid capital necessary to buy back equity shares from an executive\'s estate, maintaining internal corporate control.', 'key'),
        ],
    },
}

# --- PAGE TEMPLATE ---
def page_html(slug, data, nav_block):
    depth = slug.count('/')
    rel = '../' * depth
    pg_title = data['title'].replace('&amp;', '&')

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{pg_title} — Trade Risk Solutions</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" /></noscript>
  <link rel="stylesheet" href="{rel}styles/main.css" />
  <link rel="stylesheet" href="{rel}styles/product.css" />
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>

{nav_block}

  <!-- HERO -->
  <section class="ph-hero">
    <div class="ph-hero-inner">
      <div class="ph-left">
        <p class="ph-eyebrow">{data['eyebrow']}</p>
        <h1 class="ph-heading">{data['heading']}</h1>
        <a href="#" class="ph-btn" data-ctac-modal data-track="product_contact">
          Contact us
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
      <div class="ph-right">
        <p class="ph-desc">{data['desc']}</p>
      </div>
    </div>
  </section>

  <!-- BENEFIT CARDS -->
  <section class="ph-cards-section">
    <div class="ph-cards-inner">
      <div class="ph-cards-grid">
{cards_html(data['cards'])}
      </div>
    </div>
  </section>

  <!-- FOOTER CTA -->
  <section class="footer-cta-section">
    <div class="footer-cta-wrap">
      <h2 class="footer-cta-heading">Find out what the right coverage looks like for you.</h2>
      <button class="footer-cta-btn" data-track="product_footer_contact" data-ctac-modal aria-label="Contact us">
        Contact us
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="site-footer">
    <div class="footer-wrap">
      <a href="/" class="footer-logo" aria-label="Trade Risk Solutions home"><span class="footer-logo-text">TRS</span></a>
      <div class="footer-contact">
        <a href="tel:+6562380888" class="footer-link">+65 6238 0888</a>
        <a href="mailto:enquiry@trade-risksol.com" class="footer-link">enquiry@trade-risksol.com</a>
        <address class="footer-address">Suntec Tower 2, 9 Temasek Boulevard<br>Singapore 038989</address>
      </div>
      <p class="footer-copy">&copy; 2025 Trade Risk Solutions. All rights reserved.</p>
    </div>
  </footer>

  <script src="{rel}scripts/nav.js"></script>
</body>
</html>'''

# --- TRAVEL PAGE (pill toggle) ---
TRAVEL_HTML_TEMPLATE = '''{nav_block}

  <!-- HERO: Travel Insurance (pill toggle) -->
  <style>
    .travel-tab-wrap {{ margin: 8px 0 24px; }}
    .travel-tab-rail {{
      display: inline-flex; background: rgba(255,255,255,0.18); backdrop-filter: blur(12px) saturate(160%);
      border: 1px solid rgba(255,255,255,0.35); border-radius: 100px; padding: 4px; gap: 2px;
    }}
    .travel-tab {{
      padding: 9px 22px; border-radius: 100px; border: none; background: transparent;
      cursor: pointer; font-family: var(--font, "Archivo", sans-serif); font-size: 13.5px; font-weight: 500;
      color: rgba(255,255,255,0.75); transition: all 0.15s; white-space: nowrap;
    }}
    .travel-tab.active {{ background: rgba(255,255,255,0.92); color: #18181b; font-weight: 600; }}
    .travel-tab:not(.active):hover {{ background: rgba(255,255,255,0.25); color: #fff; }}
    .travel-panel {{ display: none; }}
    .travel-panel.active {{ display: block; }}
  </style>
  <section class="ph-hero">
    <div class="ph-hero-inner">
      <div class="ph-left">
        <p class="ph-eyebrow">Travel Insurance</p>
        <div class="travel-tab-wrap">
          <div class="travel-tab-rail" role="tablist" aria-label="Travel plan type">
            <button class="travel-tab active" data-panel="single" role="tab" aria-selected="true">Single Trip</button>
            <button class="travel-tab" data-panel="annual" role="tab" aria-selected="false">Annual Trip</button>
          </div>
        </div>
        <h1 class="ph-heading" id="travel-heading">Wander with absolute peace of mind</h1>
        <a href="#" class="ph-btn" data-ctac-modal data-track="product_contact">
          Contact us
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
      <div class="ph-right">
        <p class="ph-desc" id="travel-desc">Comprehensive, trip-specific protection covering medical emergencies, travel disruptions, and baggage loss from the moment you depart until you return home.</p>
      </div>
    </div>
  </section>

  <!-- SINGLE TRIP CARDS -->
  <div class="travel-panel active" id="panel-single">
    <section class="ph-cards-section">
      <div class="ph-cards-inner">
        <div class="ph-cards-grid">
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
            <p class="ph-card-title">Overseas Medical Care</p>
            <p class="ph-card-body">Full coverage for emergency medical treatment, hospital stays, and outpatient care while traveling outside Singapore.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <p class="ph-card-title">Journey Disruption</p>
            <p class="ph-card-body">Compensation for non-refundable flight cancellations, missed connections, travel delays, or unexpected trip curtailments.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <p class="ph-card-title">Baggage &amp; Personal Effects</p>
            <p class="ph-card-body">Protection against the loss, theft, or accidental damage of your luggage, personal electronics, and vital travel documents.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
            <p class="ph-card-title">24/7 Global Evacuation</p>
            <p class="ph-card-body">Immediate access to emergency medical evacuation, repatriation services, and international assistance helplines worldwide.</p>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- ANNUAL TRIP CARDS -->
  <div class="travel-panel" id="panel-annual">
    <section class="ph-cards-section">
      <div class="ph-cards-inner">
        <div class="ph-cards-grid">
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
            <p class="ph-card-title">Unlimited Multi-Trip Protection</p>
            <p class="ph-card-body">Continuous, seamless coverage for every business trip or weekend getaway you take over a rolling 12-month period.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <p class="ph-card-title">Travel Delay Cash Benefits</p>
            <p class="ph-card-body">Automated or swift cash payouts for extended airline delays, flight overbookings, or baggage arrival delays.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
            <p class="ph-card-title">Leisure Sports Protection</p>
            <p class="ph-card-body">Built-in coverage for popular vacation activities like skiing, scuba diving, and trekking without requiring costly premium add-ons.</p>
          </div>
          <div class="ph-card">
            <div class="ph-card-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
            <p class="ph-card-title">Rental Car Excess Waiver</p>
            <p class="ph-card-body">Eliminates high rental company out-of-pocket charges by covering the insurance excess on rental vehicles driven overseas.</p>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- FOOTER CTA -->
  <section class="footer-cta-section">
    <div class="footer-cta-wrap">
      <h2 class="footer-cta-heading">Find out what the right coverage looks like for you.</h2>
      <button class="footer-cta-btn" data-track="product_footer_contact" data-ctac-modal aria-label="Contact us">
        Contact us
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="site-footer">
    <div class="footer-wrap">
      <a href="/" class="footer-logo" aria-label="Trade Risk Solutions home"><span class="footer-logo-text">TRS</span></a>
      <div class="footer-contact">
        <a href="tel:+6562380888" class="footer-link">+65 6238 0888</a>
        <a href="mailto:enquiry@trade-risksol.com" class="footer-link">enquiry@trade-risksol.com</a>
        <address class="footer-address">Suntec Tower 2, 9 Temasek Boulevard<br>Singapore 038989</address>
      </div>
      <p class="footer-copy">&copy; 2025 Trade Risk Solutions. All rights reserved.</p>
    </div>
  </footer>

  <script src="../../scripts/nav.js"></script>
  <script>
    var TRAVEL = {{
      single: {{
        heading: 'Wander with absolute peace of mind',
        desc: 'Comprehensive, trip-specific protection covering medical emergencies, travel disruptions, and baggage loss from the moment you depart until you return home.'
      }},
      annual: {{
        heading: 'Frequent departures, continuous protection',
        desc: 'The smart, cost-effective solution for frequent travelers. Enjoy year-round coverage for unlimited international trips without the hassle of buying a policy every time you fly.'
      }}
    }};
    document.querySelectorAll('.travel-tab').forEach(function(tab) {{
      tab.addEventListener('click', function() {{
        var p = tab.dataset.panel;
        document.querySelectorAll('.travel-tab').forEach(function(t) {{
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        }});
        document.getElementById('travel-heading').textContent = TRAVEL[p].heading;
        document.getElementById('travel-desc').textContent = TRAVEL[p].desc;
        document.querySelectorAll('.travel-panel').forEach(function(panel) {{ panel.classList.remove('active'); }});
        document.getElementById('panel-' + p).classList.add('active');
      }});
    }});
  </script>
</body>
</html>'''

# --- EXTRACT NAV FROM index.html ---
def extract_nav(source_path):
    with open(source_path) as f:
        src = f.read()
    patterns = [
        r'(  <header class="nav">.*?  </aside>)',
        r'(<header class="nav">.*?</aside>)',
    ]
    for pat in patterns:
        m = re.search(pat, src, re.DOTALL)
        if m:
            return m.group(1)
    raise RuntimeError('Could not extract nav from ' + source_path)

# --- UPDATE NAV LINKS IN index.html ---
def update_index_nav_links(index_path):
    with open(index_path) as f:
        src = f.read()

    # Desktop mega nav fixes (order matters for the professional-indemnity ones)
    replacements = [
        # Business Interruption
        ('<a href="#" class="mega-prod-link">Business Interruption (BI)</a>',
         '<a href="/commercial/revenue" class="mega-prod-link">Business Interruption (BI)</a>'),
        # Electronic Equipment (was pointing to /equipment)
        ('<a href="/commercial/equipment" class="mega-prod-link">Electronic Equipment Insurance</a>',
         '<a href="/commercial/electronic-equipment" class="mega-prod-link">Electronic Equipment Insurance</a>'),
        # Marine Cargo
        ('<a href="/commercial/marine" class="mega-prod-link">Marine Cargo</a>',
         '<a href="/commercial/inventory" class="mega-prod-link">Marine Cargo</a>'),
        # Stock Throughput
        ('<a href="#" class="mega-prod-link">Stock Throughput</a>',
         '<a href="/commercial/stock-throughput" class="mega-prod-link">Stock Throughput</a>'),
        # Inland Transit
        ('<a href="/commercial/marine" class="mega-prod-link">Inland Transit</a>',
         '<a href="/commercial/inland-transit" class="mega-prod-link">Inland Transit</a>'),
        # Trade Credit
        ('<a href="#" class="mega-prod-link">Trade Credit</a>',
         '<a href="/commercial/financial-assets" class="mega-prod-link">Trade Credit</a>'),
        # Surety Bonds
        ('<a href="#" class="mega-prod-link">Surety Bonds</a>',
         '<a href="/commercial/surety-bonds" class="mega-prod-link">Surety Bonds</a>'),
        # GCL
        ('<a href="/commercial/liability" class="mega-prod-link">General Comprehensive Liability</a>',
         '<a href="/commercial/core-liability" class="mega-prod-link">General Comprehensive Liability</a>'),
        # IMI
        ('<a href="#" class="mega-prod-link">Investment Management Insurance (IMI)</a>',
         '<a href="/commercial/imi" class="mega-prod-link">Investment Management Insurance (IMI)</a>'),
        # Medical Malpractice
        ('<a href="#" class="mega-prod-link">Medical Malpractice Insurance</a>',
         '<a href="/commercial/medical-malpractice" class="mega-prod-link">Medical Malpractice Insurance</a>'),
        # D&O (first professional-indemnity)
        ('<a href="/commercial/professional-indemnity" class="mega-prod-link">Directors &amp; Officers (D&amp;O)</a>',
         '<a href="/commercial/dao" class="mega-prod-link">Directors &amp; Officers (D&amp;O)</a>'),
        # PI (second professional-indemnity)
        ('<a href="/commercial/professional-indemnity" class="mega-prod-link">Professional Indemnity (PI)</a>',
         '<a href="/commercial/professional" class="mega-prod-link">Professional Indemnity (PI)</a>'),
        # Foreign Worker Bond (Workforce panel)
        ('<a href="#" class="mega-link-item"><span class="mega-link-title">Foreign Worker Bond Insurance</span><span class="mega-link-sub">Bond insurance for work permit holders</span></a>',
         '<a href="/commercial/foreign-worker-bond" class="mega-link-item"><span class="mega-link-title">Foreign Worker Bond Insurance</span><span class="mega-link-sub">Bond insurance for work permit holders</span></a>'),
        # Group Business Travel
        ('<a href="#" class="mega-link-item"><span class="mega-link-title">Group Business Travel</span><span class="mega-link-sub">Business travel coverage</span></a>',
         '<a href="/employees/group-travel" class="mega-link-item"><span class="mega-link-title">Group Business Travel</span><span class="mega-link-sub">Business travel coverage</span></a>'),
        # Employee Benefits Insurance
        ('<a href="#" class="mega-link-item"><span class="mega-link-title">Employee Benefits Insurance</span><span class="mega-link-sub">Comprehensive benefits package</span></a>',
         '<a href="/employees/benefits" class="mega-link-item"><span class="mega-link-title">Employee Benefits Insurance</span><span class="mega-link-sub">Comprehensive benefits package</span></a>'),
        # D&O Liability (Executive)
        ('<a href="#" class="mega-link-item"><span class="mega-link-title">D&amp;O Liability</span><span class="mega-link-sub">Directors &amp; Officers protection</span></a>',
         '<a href="/employees/dao" class="mega-link-item"><span class="mega-link-title">D&amp;O Liability</span><span class="mega-link-sub">Directors &amp; Officers protection</span></a>'),
        # Keyman Insurance
        ('<a href="#" class="mega-link-item"><span class="mega-link-title">Keyman Insurance</span><span class="mega-link-sub">Key person &amp; business continuity</span></a>',
         '<a href="/employees/keyman" class="mega-link-item"><span class="mega-link-title">Keyman Insurance</span><span class="mega-link-sub">Key person &amp; business continuity</span></a>'),
    ]

    for old, new in replacements:
        src = src.replace(old, new)

    # Mobile drawer: replace the Business Assets/Liabilities section with proper product links
    old_drawer_biz = '''        <span class="nav-drawer-group-label">Business &#8212; Assets</span>
        <a href="/commercial/property">Physical Property &amp; Infrastructure</a>
        <a href="#">Equipment &amp; Machinery</a>
        <a href="#">Inventory &amp; Goods in Transit</a>
        <a href="#">Financial &amp; Monetary Assets</a>
        <a href="#">Revenue &amp; Continuity</a>
        <a href="/commercial/specialized">Specialized Asset Coverage</a>
        <span class="nav-drawer-group-label">Business &#8212; Liabilities</span>
        <a href="/commercial/core-liability">Core Liability</a>
        <a href="#">Professional &amp; Management Liability</a>
        <a href="/commercial/workmen">Statutory &amp; Employee-Related</a>
        <a href="/commercial/cyber">Digital &amp; Niche Liabilities</a>'''

    new_drawer_biz = '''        <span class="nav-drawer-group-label">Business &#8212; Assets</span>
        <a href="/commercial/property">IAR &amp; Fire</a>
        <a href="/commercial/revenue">Business Interruption</a>
        <a href="/commercial/car">Contractors&#39; All Risks (CAR)</a>
        <a href="/commercial/equipment">Machinery Breakdown</a>
        <a href="/commercial/electronic-equipment">Electronic Equipment Insurance</a>
        <a href="/commercial/inventory">Marine Cargo</a>
        <a href="/commercial/stock-throughput">Stock Throughput</a>
        <a href="/commercial/inland-transit">Inland Transit</a>
        <a href="/commercial/financial-assets">Trade Credit</a>
        <a href="/commercial/surety-bonds">Surety Bonds</a>
        <a href="/commercial/motor">Commercial Vehicle Insurance</a>
        <span class="nav-drawer-group-label">Business &#8212; Liabilities</span>
        <a href="/commercial/core-liability">General Comprehensive Liability</a>
        <a href="/commercial/imi">Investment Management Insurance (IMI)</a>
        <a href="/commercial/medical-malpractice">Medical Malpractice Insurance</a>
        <a href="/commercial/dao">Directors &amp; Officers (D&amp;O)</a>
        <a href="/commercial/professional">Professional Indemnity (PI)</a>
        <a href="/commercial/cyber">Cyber Insurance</a>'''

    src = src.replace(old_drawer_biz, new_drawer_biz)

    with open(index_path, 'w') as f:
        f.write(src)
    print(f'Updated nav links in {index_path}')

# --- UPDATE business/index.html biz-body links ---
def update_business_page(biz_path):
    with open(biz_path) as f:
        src = f.read()

    replacements = [
        ('<a href="#" class="biz-prod-link">Business Interruption (BI)',
         '<a href="/commercial/revenue" class="biz-prod-link">Business Interruption (BI)'),
        ('<a href="/commercial/equipment" class="biz-prod-link">Electronic Equipment Insurance',
         '<a href="/commercial/electronic-equipment" class="biz-prod-link">Electronic Equipment Insurance'),
        ('<a href="/commercial/marine" class="biz-prod-link">Marine Cargo',
         '<a href="/commercial/inventory" class="biz-prod-link">Marine Cargo'),
        ('<a href="#" class="biz-prod-link">Stock Throughput',
         '<a href="/commercial/stock-throughput" class="biz-prod-link">Stock Throughput'),
        ('<a href="/commercial/marine" class="biz-prod-link">Inland Transit',
         '<a href="/commercial/inland-transit" class="biz-prod-link">Inland Transit'),
        ('<a href="#" class="biz-prod-link">Trade Credit',
         '<a href="/commercial/financial-assets" class="biz-prod-link">Trade Credit'),
        ('<a href="#" class="biz-prod-link">Surety Bonds',
         '<a href="/commercial/surety-bonds" class="biz-prod-link">Surety Bonds'),
        ('<a href="/commercial/liability" class="biz-prod-link">General Comprehensive Liability',
         '<a href="/commercial/core-liability" class="biz-prod-link">General Comprehensive Liability'),
        ('<a href="#" class="biz-prod-link">Investment Management Insurance (IMI)',
         '<a href="/commercial/imi" class="biz-prod-link">Investment Management Insurance (IMI)'),
        ('<a href="#" class="biz-prod-link">Medical Malpractice Insurance',
         '<a href="/commercial/medical-malpractice" class="biz-prod-link">Medical Malpractice Insurance'),
        ('<a href="/commercial/professional-indemnity" class="biz-prod-link">Directors &amp; Officers (D&amp;O)',
         '<a href="/commercial/dao" class="biz-prod-link">Directors &amp; Officers (D&amp;O)'),
        ('<a href="/commercial/professional-indemnity" class="biz-prod-link">Professional Indemnity (PI)',
         '<a href="/commercial/professional" class="biz-prod-link">Professional Indemnity (PI)'),
    ]
    for old, new in replacements:
        src = src.replace(old, new)

    with open(biz_path, 'w') as f:
        f.write(src)
    print(f'Updated biz links in {biz_path}')

# --- GET ALL HTML FILES ---
def all_html_files():
    result = []
    for root, dirs, files in os.walk(BASE):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules',)]
        for fn in files:
            if fn.endswith('.html'):
                result.append(os.path.join(root, fn))
    return result

# --- PROPAGATE NAV ---
def propagate_nav(nav_block, html_files, skip_paths):
    patterns = [
        r'(  <header class="nav">.*?  </aside>)',
        r'(<header class="nav">.*?</aside>)',
    ]
    updated = 0
    for path in html_files:
        if path in skip_paths:
            continue
        with open(path) as f:
            src = f.read()
        replaced = False
        for pat in patterns:
            m = re.search(pat, src, re.DOTALL)
            if m:
                new_src = src[:m.start()] + nav_block + src[m.end():]
                with open(path, 'w') as f:
                    f.write(new_src)
                replaced = True
                updated += 1
                break
        if not replaced:
            print(f'  WARN: no nav found in {path}')
    print(f'Propagated nav to {updated} files')

# --- MAIN ---
def main():
    index_path = os.path.join(BASE, 'index.html')

    # 1. Update nav links in index.html
    update_index_nav_links(index_path)

    # 2. Update business page biz-body links
    update_business_page(os.path.join(BASE, 'business', 'index.html'))

    # 3. Extract canonical nav from updated index.html
    nav_block = extract_nav(index_path)
    print('Extracted canonical nav block')

    # 4. Create/update all product pages (except travel)
    created, updated = 0, 0
    for slug, data in PAGES.items():
        page_dir = os.path.join(BASE, slug)
        page_path = os.path.join(page_dir, 'index.html')
        os.makedirs(page_dir, exist_ok=True)
        html = page_html(slug, data, nav_block)
        existed = os.path.exists(page_path)
        with open(page_path, 'w') as f:
            f.write(html)
        if existed:
            updated += 1
        else:
            created += 1
        print(f'{"Updated" if existed else "Created"}: {page_path}')

    print(f'\nProduct pages: {created} created, {updated} updated')

    # 5. Build travel page (pill toggle)
    travel_path = os.path.join(BASE, 'consumers', 'travel', 'index.html')
    travel_head = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Travel Insurance — TRS Personal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" as="style" onload="this.onload=null;this.rel=\'stylesheet\'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" /></noscript>
  <link rel="stylesheet" href="../../styles/main.css" />
  <link rel="stylesheet" href="../../styles/product.css" />
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>

'''
    travel_body = TRAVEL_HTML_TEMPLATE.format(nav_block=nav_block)
    with open(travel_path, 'w') as f:
        f.write(travel_head + travel_body)
    print(f'Built travel page: {travel_path}')

    # 6. Propagate updated nav to all pages
    all_files = all_html_files()
    skip = {index_path, os.path.join(BASE, 'business', 'index.html')}
    # Also skip the product pages we just wrote (nav already embedded)
    for slug in PAGES:
        skip.add(os.path.join(BASE, slug, 'index.html'))
    skip.add(travel_path)

    propagate_nav(nav_block, all_files, skip)
    print('\nDone!')

if __name__ == '__main__':
    main()
