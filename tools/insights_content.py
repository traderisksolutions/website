"""Insights articles for traderisksolutions.com.sg.

Rules for every post: answer first; question headings; no TRS prices, quotes or promised outcomes;
every figure carries its source in SOURCES; no copying of other sites' text.
Each post: slug, cat, title, desc (meta, <=160 chars), answer (40-60 words), sections [(h2, [paras], table?)],
faq [(q, a)], links [product paths], sources [(label, url)], minutes, date.
"""

MOM_WICA = ('Ministry of Manpower: Work Injury Compensation Act', 'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation')
AG_LIMITS = ('Allen & Gledhill: MOM announces higher work injury compensation limits', 'https://www.allenandgledhill.com/sg/publication/articles/27502/mom-announces-higher-work-injury-compensation-limits')
MOM_FWMI = ('Ministry of Manpower: Medical insurance requirements for foreign workers', 'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance')
MOM_BOND = ('Ministry of Manpower: Security bond requirements for Work Permit holders', 'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/security-bond')
PDPC = ('PDPC: Amendments to enforcement under the PDPA', 'https://www.pdpc.gov.sg/news-and-events/announcements/2022/09/amendments-to-enforcement-under-the-personal-data-protection-act-in-updated-advisory-guidelines-and-guide')
FIDREC = ('FIDReC: Glossary and claim limits', 'https://www.fidrec.com.sg/knowledgebase/article/KA-01227/en-us')
MAS_BROKER = ('MAS: Insurance broker registration', 'https://www.mas.gov.sg/regulation/insurance/insurance-broker-registration-and-approval')

D = '24 Oct 2026'

POSTS = [
dict(slug='is-wica-compulsory-for-office-staff', cat='Workforce', minutes=6, date=D,
 title='Is WICA insurance compulsory for office staff? The S$2,600 rule explained',
 desc='Who the Work Injury Compensation Act requires a Singapore employer to insure, who it does not, and why many employers cover every employee.',
 answer='WICA insurance is compulsory for every employee doing manual work, whatever they earn, and for non-manual employees earning S$2,600 a month or less. Office staff above S$2,600 are still covered by the Act if they are injured at work; the employer is simply not required to insure them.',
 sections=[
  ('Who must be insured under WICA?', ['The Work Injury Compensation Act sets two groups an employer must insure: all manual workers, regardless of salary, and non-manual workers earning S$2,600 or less a month.', 'Manual work means work that is mainly physical: construction, cleaning, warehousing, delivery, kitchen work. Non-manual work is mainly office or desk work.'],
   (['Employee', 'Insurance compulsory?'], [['Manual worker, any salary', 'Yes'], ['Non-manual, S$2,600 or less a month', 'Yes'], ['Non-manual, above S$2,600 a month', 'No, but the Act still applies']])),
  ('What happens if a higher-paid office worker is injured?', ['The Act covers all employees under a contract of service, insured or not. If an office manager earning above S$2,600 is injured at work, the employer still owes compensation under the Act.', 'Without insurance, that compensation comes from the company\'s own funds. That is why many employers extend their WICA policy to every employee rather than only the compulsory groups.']),
  ('What does WICA compensation cover?', ['Compensation covers medical expenses, medical leave wages, and lump sums for permanent incapacity or death. MOM raised the limits from 1 November 2025: up to S$269,000 for death, up to S$346,000 for total permanent incapacity, and medical expenses up to S$53,000 or one year from the accident, whichever comes first.']),
  ('What are the penalties for not insuring?', ['Failing to insure employees the Act requires you to insure is an offence, with fines and possible imprisonment. It also leaves the company paying any claim itself.']),
  ('How should an employer check its cover?', ['Compare the policy schedule against the current headcount and payroll. Check that every manual worker and every non-manual employee at or below S$2,600 is declared, with the right occupation and wages. Under-declared wages can leave a claim short.']),
 ],
 faq=[('Is WICA the same as workmen\'s compensation?', 'Yes. WICA replaced the older Workmen\'s Compensation Act; the term workmen\'s compensation is still used informally.'),
      ('Does WICA cover part-time staff?', 'The Act covers employees under a contract of service, including part-timers. Whether insurance is compulsory follows the same manual and S$2,600 rules.'),
      ('Are interns and freelancers covered?', 'Freelancers and independent contractors are not employees under the Act. Interns may be, depending on the arrangement; check the contract.')],
 links=['commercial/workmen', 'commercial/foreign-worker'], sources=[MOM_WICA, AG_LIMITS]),

dict(slug='how-wica-premiums-are-worked-out', cat='Workforce', minutes=5, date=D,
 title='How WICA premiums are worked out: wages, job class and claims history',
 desc='The factors insurers use to set a WICA premium in Singapore, and the information that keeps the quote accurate.',
 answer='Insurers price WICA on three things: the annual wages declared for each group of employees, the risk of the work each group does, and the company\'s past claims. Manual trades cost more to insure than office work, and a clean claims record helps at renewal.',
 sections=[
  ('What does the insurer look at?', ['The starting point is wageroll: the total annual wages for each occupation group. The insurer applies a rate to each group according to how hazardous the work is.', 'Construction, marine, manufacturing and logistics roles carry higher rates than clerical roles because injuries are more frequent and more serious.'],
   (['Factor', 'Effect'], [['Declared wages by occupation', 'The base the rate is applied to'], ['Type of work', 'Higher hazard, higher rate'], ['Claims in recent years', 'Frequent or large claims raise the rate'], ['Safety record and controls', 'Can support better terms at renewal']])),
  ('Why do declared wages matter?', ['If the wages declared are lower than actual wages, the policy may not respond fully to a claim, and the insurer can adjust the premium at the end of the period. Declare the full wageroll and update it when headcount changes.']),
  ('Can the cover be wider than the law requires?', ['Yes. Many employers insure all employees, including non-manual staff above S$2,600 a month, and add employer\'s liability cover for claims made under common law rather than under WICA.']),
  ('What should be ready before asking for a quote?', ['Headcount and annual wages by occupation, a description of the work and sites, and a claims history for the past three to five years. The more complete the file, the more insurers will quote.']),
 ],
 faq=[('Is the WICA premium fixed for the year?', 'The premium is based on estimated wages. Some policies adjust at the end of the year to actual wages.'),
      ('Does a past claim stop a company getting cover?', 'Not usually. It affects the rate and terms; the full history should still be disclosed.')],
 links=['commercial/workmen'], sources=[MOM_WICA]),

dict(slug='foreign-worker-medical-insurance-minimum', cat='Workforce', minutes=6, date=D,
 title='Foreign worker medical insurance: the S$60,000 minimum and what it covers',
 desc='What Singapore employers must buy for Work Permit and S Pass holders: the S$60,000 annual minimum, co-payment and what the policy must cover.',
 answer='Employers must hold medical insurance for each Work Permit and S Pass holder covering at least S$60,000 a year for inpatient care and day surgery. Above S$15,000, the insurer pays 75% and the employer 25%. The policy must cover non-work illness as well as injury.',
 sections=[
  ('What is the minimum cover?', ['Since 1 July 2023, the minimum annual cover is S$60,000 per worker for inpatient care and day surgery, up from S$15,000. Where a plan has sub-limits, each sub-limit must itself meet the minimum.']),
  ('How does the co-payment work?', ['For the part of a bill above S$15,000, the insurer pays 75% and the employer pays 25%. Employers cannot pass medical costs on to the worker.'],
   (['Part of the bill', 'Who pays'], [['Up to S$15,000', 'Insurer, within the policy'], ['Above S$15,000', '75% insurer, 25% employer']])),
  ('Does it overlap with WICA?', ['Foreign worker medical insurance covers illness and injury that is not work-related. Work injuries are claimed under WICA. Employers usually need both.']),
  ('When must the policy be in place?', ['Before the Work Permit or S Pass is issued, and for the whole period the pass is valid. Renew it with the pass.']),
 ],
 faq=[('Does the policy cover outpatient visits?', 'The minimum requirement is inpatient care and day surgery. Outpatient cover is optional and can be added.'),
      ('Is foreign worker medical insurance the same as the security bond?', 'No. The bond is a separate guarantee to MOM for Work Permit holders.')],
 links=['commercial/foreign-worker', 'commercial/foreign-worker-bond', 'commercial/workmen'], sources=[MOM_FWMI]),

dict(slug='work-permit-security-bond', cat='Workforce', minutes=4, date=D,
 title='Security bond for Work Permit holders: banker’s guarantee or insurance guarantee?',
 desc='What the S$5,000 security bond for non-Malaysian Work Permit holders is, when it is needed, and the two ways to put it in place.',
 answer='Employers must post a S$5,000 security bond to MOM for each non-Malaysian Work Permit holder before the worker arrives. It can be a banker’s guarantee or an insurance guarantee. An insurance guarantee avoids tying up cash; the insurer pays MOM if the bond is forfeited and recovers it from the employer.',
 sections=[
  ('What is the bond for?', ['The bond secures the employer\'s obligations to MOM, such as paying the worker and sending them home when employment ends. It can be forfeited if those obligations are breached.']),
  ('Banker’s guarantee or insurance guarantee?', ['A banker\'s guarantee usually needs cash or a facility held against it. An insurance guarantee is bought for a fee and does not lock up working capital.'],
   (['', 'Banker’s guarantee', 'Insurance guarantee'], [['Issued by', 'A bank', 'An insurer'], ['Cash tied up', 'Usually yes', 'No'], ['If forfeited', 'Bank pays MOM', 'Insurer pays MOM, recovers from employer']])),
  ('When is it needed?', ['Before the worker arrives in Singapore. It stays in place for the duration of the Work Permit.']),
 ],
 faq=[('Is the bond needed for Malaysian workers?', 'MOM does not require the bond for Malaysian Work Permit holders.'),
      ('Does the bond protect the employer?', 'No. It protects MOM. The employer remains liable to repay the insurer if a claim is paid.')],
 links=['commercial/foreign-worker-bond', 'commercial/foreign-worker'], sources=[MOM_BOND]),

dict(slug='group-medical-insurance-for-smes', cat='Workforce', minutes=6, date=D,
 title='Group medical insurance for SMEs: how small groups are underwritten and what to compare',
 desc='How insurers set terms for small company groups in Singapore, and the plan features to compare before choosing a group medical scheme.',
 answer='Small groups are usually underwritten on headcount, age profile, industry and past claims rather than individual health checks. Compare inpatient limits, ward entitlement, outpatient cover, pre-existing condition terms and how claims are made, not just the premium.',
 sections=[
  ('How do insurers look at a small group?', ['For small companies, insurers look at the number of employees, their ages, the industry, and any claims history. Some small-group plans apply a moratorium on pre-existing conditions for an initial period instead of medical questionnaires.']),
  ('What should be compared?', ['Two plans at a similar premium can pay very differently.'],
   (['Feature', 'What to check'], [['Inpatient limit', 'Per year and per disability'], ['Ward entitlement', 'Public or private hospital, room type'], ['Outpatient', 'Panel clinics, specialist referral, co-payment'], ['Pre-existing conditions', 'Covered, excluded or moratorium'], ['Dependants', 'Whether spouses and children can join'], ['Claims', 'Cashless panel or reimbursement']])),
  ('How often should the plan be reviewed?', ['At every renewal, against the current headcount and the claims the plan has paid. Headcount and age changes move the premium; plan design can be adjusted to keep the benefits that employees use.']),
 ],
 faq=[('What is the minimum number of employees?', 'It depends on the insurer and plan. Several insurers accept groups of a handful of employees.'),
      ('Can employees add family members?', 'Many plans allow dependants, at an additional premium.')],
 links=['employees/medical', 'employees/benefits'], sources=[]),

dict(slug='employee-benefits-review-checklist', cat='Workforce', minutes=5, date=D,
 title='Employee benefits review: seven things to check before renewal',
 desc='A renewal checklist for Singapore employers reviewing group medical, group personal accident and other staff benefits.',
 answer='Start a benefits review at least 90 days before renewal. Check headcount and data accuracy, claims paid against premium, plan features employees actually use, gaps for senior staff and dependants, and whether the insurer’s service has worked when it was needed.',
 sections=[
  ('Why start early?', ['Insurers need accurate census data and claims history to quote. Starting 90 days out leaves time to approach several insurers and adjust the plan.']),
  ('The checklist', ['Work through these before asking for quotes.'],
   (['#', 'Check'], [['1', 'Census data: headcount, ages, joiners and leavers'], ['2', 'Claims paid compared with premium'], ['3', 'Benefits used most, and least'], ['4', 'Gaps for senior staff and dependants'], ['5', 'Panel clinics and how employees claim'], ['6', 'Group personal accident and travel cover'], ['7', 'Service: how quickly claims and changes were handled']])),
  ('What changes most often at review?', ['Outpatient design, co-payments and ward entitlement are the usual levers. Changes should be explained to employees before the renewal date.']),
 ],
 faq=[('Can benefits change mid-year?', 'Additions and removals of employees happen through the year. Plan design normally changes at renewal.')],
 links=['employees/benefits', 'employees/medical', 'employees/group-travel'], sources=[]),

dict(slug='directors-and-officers-insurance-private-companies', cat='Liability', minutes=7, date=D,
 title='D&O insurance for private companies: when directors are personally exposed',
 desc='Why directors of private Singapore companies face personal claims, what a D&O policy pays, and the terms to check.',
 answer='Directors can be sued personally for decisions they make for the company, by shareholders, creditors, regulators, employees or liquidators. D&O insurance pays defence costs and covered losses for directors and officers, and can reimburse the company when it indemnifies them.',
 sections=[
  ('Who brings claims against directors?', ['Claims come from shareholders, creditors, regulators, employees, customers and, after an insolvency, liquidators. Private companies face these claims as well as listed ones.']),
  ('What does a D&O policy pay?', ['Policies are usually built in three parts.'],
   (['Part', 'What it covers'], [['Side A', 'Directors personally, when the company cannot indemnify them'], ['Side B', 'The company, when it indemnifies its directors'], ['Side C', 'The company itself, mainly for securities claims (listed companies)']])),
  ('Which terms matter most?', ['Defence costs inside or outside the limit, the insured-versus-insured exclusion and its carve-backs, cover for former directors, and how the policy treats claims after a change of control.']),
  ('When should a private company buy it?', ['Before raising capital, taking on outside directors, borrowing significantly or entering a regulated activity. Cover is written on a claims-made basis, so continuity matters.']),
 ],
 faq=[('Does D&O cover fines?', 'Fines and penalties are generally excluded where the law prohibits insuring them.'),
      ('Is D&O the same as professional indemnity?', 'No. PI covers the firm\'s services to clients; D&O covers management decisions.')],
 links=['commercial/dao', 'employees/dao', 'commercial/professional'], sources=[]),

dict(slug='professional-indemnity-claims-made-retroactive-date', cat='Liability', minutes=6, date=D,
 title='Professional indemnity: claims-made cover and the retroactive date',
 desc='How claims-made PI policies work, what the retroactive date does, and how to avoid gaps when changing insurer.',
 answer='Professional indemnity is written on a claims-made basis: the policy that responds is the one in force when the claim is made, not when the work was done. The retroactive date sets how far back the work can be. Keep it unchanged when switching insurers to avoid a gap.',
 sections=[
  ('What does claims-made mean?', ['A claim made in 2026 about advice given in 2023 is handled by the 2026 policy, provided the advice was given after the retroactive date and the claim is notified in time.']),
  ('What is the retroactive date?', ['It is the earliest date of work the policy will cover. A policy with a retroactive date of 1 January 2020 will not respond to work done before then.'],
   (['Situation', 'Effect'], [['Retroactive date kept on renewal', 'Past work stays covered'], ['Retroactive date moved forward', 'Earlier work loses cover'], ['Policy lapses', 'No cover for new claims, even on old work']])),
  ('What happens when the business stops or is sold?', ['Run-off cover keeps the firm protected for claims about past work after it stops trading or is sold. It is arranged before the policy ends.']),
  ('Who needs PI?', ['Consultants, engineers, architects, accountants, technology providers, and any firm whose advice or service could cause a client financial loss. Some contracts and professional bodies require it.']),
 ],
 faq=[('Should circumstances be notified before a claim?', 'Yes. Notifying a circumstance that might lead to a claim, within the policy period, preserves cover under that policy.')],
 links=['commercial/professional', 'commercial/dao', 'commercial/cyber'], sources=[]),

dict(slug='public-liability-vs-product-liability', cat='Liability', minutes=5, date=D,
 title='Public liability vs product liability: which policy pays',
 desc='The difference between public and product liability insurance for Singapore businesses, with examples of which one responds.',
 answer='Public liability pays when the business injures someone or damages their property through its activities or premises. Product liability pays when a product the business made, supplied or sold causes injury or damage after it has left the business’s hands. Many policies combine both.',
 sections=[
  ('Public liability: the business’s activities', ['A visitor slips in the showroom. A contractor damages a client\'s ceiling during installation. These arise from what the business does or the premises it occupies.']),
  ('Product liability: what the business supplies', ['A heater supplied by a distributor overheats in a customer\'s home. A food product causes illness. These arise from the product after it has been supplied.'],
   (['Incident', 'Policy that responds'], [['Customer trips in your office', 'Public liability'], ['Your staff damage a client’s property on site', 'Public liability'], ['A product you sold injures a buyer', 'Product liability'], ['A component you made fails in another firm’s product', 'Product liability']])),
  ('What to check in the wording', ['Territorial and jurisdiction limits, especially exports to the United States and Canada; whether the limit is per occurrence or in the aggregate; and exclusions for contractual liability.']),
 ],
 faq=[('Is public liability compulsory in Singapore?', 'Not by statute for most businesses, but landlords, main contractors and clients often require it by contract.')],
 links=['commercial/core-liability'], sources=[]),

dict(slug='cyber-insurance-pdpa-breach', cat='Liability', minutes=6, date=D,
 title='Cyber insurance for SMEs under the PDPA: what a policy pays after a breach',
 desc='What cyber insurance pays after a data breach or ransomware attack in Singapore, and how the PDPA penalty regime affects the risk.',
 answer='A cyber policy pays for incident response, data restoration, business interruption and claims from third parties after a breach or attack. Under the PDPA, the maximum financial penalty is S$1 million or 10% of annual Singapore turnover for organisations above S$10 million, whichever is higher.',
 sections=[
  ('What does a cyber policy pay?', ['Cover is split between the business\'s own losses and its liability to others.'],
   (['Cover', 'Examples'], [['Incident response', 'Forensic investigators, legal advice, notifying affected people'], ['Data and systems', 'Restoring data and rebuilding systems'], ['Business interruption', 'Lost profit while systems are down'], ['Liability', 'Claims from customers and partners whose data was exposed'], ['Regulatory', 'Defence in regulatory investigations; penalties where insurable']])),
  ('How does the PDPA change the risk?', ['Since 1 October 2022, the PDPC can impose a financial penalty of up to S$1 million, or 10% of annual turnover in Singapore for organisations with local turnover above S$10 million, whichever is higher.']),
  ('What do insurers ask before quoting?', ['Multi-factor authentication, backups kept offline, patching, endpoint protection, staff training and an incident response plan. Weak controls can mean exclusions or no offer.']),
 ],
 faq=[('Does cyber insurance pay ransoms?', 'Some policies cover extortion payments where lawful; many add conditions. Check the wording.'),
      ('Is cyber covered under a property policy?', 'Usually not. Property policies commonly exclude cyber events.')],
 links=['commercial/cyber', 'commercial/professional'], sources=[PDPC]),

dict(slug='contractors-all-risks-explained', cat='Property and projects', minutes=5, date=D,
 title='Contractors’ all risks insurance for fit-outs and construction projects',
 desc='What a contractors’ all risks (CAR) policy covers on a Singapore project, who arranges it, and the terms to check.',
 answer='Contractors’ all risks covers physical loss or damage to the works during construction, and usually third-party liability arising from the project. It runs from the start of work to handover, often with a maintenance period after. Main contracts usually say who must arrange it.',
 sections=[
  ('What does CAR cover?', ['Section 1 covers the works, materials on site and, if added, plant and equipment. Section 2 covers liability to third parties for injury or property damage caused by the project.']),
  ('Who arranges it?', ['The contract decides: sometimes the owner, more often the main contractor, naming subcontractors and the owner as insureds.'],
   (['Term', 'What to check'], [['Contract value', 'Full value of the works, including materials supplied by others'], ['Period', 'Start date to handover, plus maintenance period'], ['Deductibles', 'Higher for flood and testing'], ['Existing structures', 'Cover for the building being renovated']])),
  ('What is commonly excluded?', ['Defective design and workmanship itself, wear and tear, and loss found only at stock-taking. Some policies cover damage resulting from defects; check the defects clause.']),
 ],
 faq=[('Does CAR cover workers’ injuries?', 'No. Employee injuries fall under WICA and employer’s liability insurance.')],
 links=['commercial/car', 'commercial/equipment', 'commercial/workmen'], sources=[]),

dict(slug='business-interruption-indemnity-period', cat='Property and projects', minutes=6, date=D,
 title='Business interruption insurance: indemnity period, gross profit and what gets paid',
 desc='How business interruption cover works after a fire or flood in Singapore, and how to set the indemnity period and sum insured.',
 answer='Business interruption pays the gross profit a business loses, and the extra costs it incurs, after insured damage to its property stops or slows trading. It pays for the indemnity period chosen on the policy, so that period must cover the full time needed to recover, not just to rebuild.',
 sections=[
  ('What triggers a claim?', ['Business interruption normally follows insured physical damage, such as a fire, under the property policy. Without covered damage, there is usually no BI claim.']),
  ('How is the indemnity period set?', ['It is the time from the damage until the business is trading as before. Rebuilding, re-equipping and winning back customers all take time; 12 months is often too short for manufacturers.'],
   (['Item', 'What to get right'], [['Indemnity period', 'Rebuild time plus recovery of sales'], ['Sum insured', 'Gross profit for the full indemnity period'], ['Extra costs', 'Temporary premises, overtime, outsourcing'], ['Suppliers and customers', 'Extensions for damage at their premises']])),
  ('What is the average clause?', ['If the gross profit insured is below the actual figure, a claim can be reduced in proportion. Recalculate the sum insured every year.']),
 ],
 faq=[('Does BI cover a pandemic closure?', 'Most policies exclude closures without physical damage, including disease outbreaks, unless a specific extension applies.')],
 links=['commercial/revenue', 'commercial/property'], sources=[]),

dict(slug='marine-cargo-institute-cargo-clauses', cat='Property and projects', minutes=5, date=D,
 title='Marine cargo insurance: Institute Cargo Clauses A, B and C compared',
 desc='The difference between ICC A, B and C cargo cover, and how Incoterms decide who insures goods in transit.',
 answer='Institute Cargo Clauses A cover all risks of loss or damage to goods in transit, subject to listed exclusions. Clauses B and C cover only named events, with C the narrowest. The Incoterm in the sale contract decides whether the buyer or seller should insure.',
 sections=[
  ('How do A, B and C differ?', ['All three exclude things like poor packing, delay and inherent vice.'],
   (['Clauses', 'Scope'], [['ICC A', 'All risks, subject to exclusions'], ['ICC B', 'Named perils, including fire, sinking, collision, earthquake, water entry'], ['ICC C', 'Fewer named perils; no cover for water damage or theft']])),
  ('Who should insure: buyer or seller?', ['Under CIF and CIP, the seller arranges insurance for the buyer. Under FOB and similar terms, the buyer carries the risk once goods are loaded and should arrange cover.']),
  ('Single shipment or open cover?', ['Regular shippers usually take an open policy that covers every shipment automatically within agreed limits, instead of insuring each one.']),
 ],
 faq=[('Does cargo insurance cover delay?', 'No. Loss caused by delay is excluded under all three sets of clauses.')],
 links=['commercial/inventory', 'commercial/inland-transit', 'commercial/stock-throughput'], sources=[]),

dict(slug='insurance-claim-rejected-fidrec', cat='Claims', minutes=6, date=D,
 title='Business insurance claim rejected in Singapore: next steps and FIDReC',
 desc='What to do when an insurer declines a claim in Singapore: reading the decision, challenging it, and when FIDReC can help.',
 answer='Ask the insurer for the decline in writing with the policy wording it relies on. Check the wording, the facts and any condition said to be breached, then put a reasoned challenge to the insurer. FIDReC can adjudicate eligible disputes up to S$150,000 per claim; mediation has no claim limit.',
 sections=[
  ('Why are claims declined?', ['Common reasons are an exclusion, a breach of a condition such as late notification, non-disclosure at inception, or the loss falling below the deductible or outside the period of insurance.']),
  ('How should a decline be challenged?', ['Set out the facts, the clause the insurer relies on, and why it does not apply. Provide documents the insurer may not have seen. A broker who placed the policy can argue it on the wording.']),
  ('When can FIDReC help?', ['FIDReC handles disputes between consumers and financial institutions, including insurers. For claims filed on or after 1 July 2024, the adjudication limit is S$150,000 per claim. Check eligibility for businesses with FIDReC.'],
   (['Route', 'Limit'], [['FIDReC mediation', 'No claim limit'], ['FIDReC adjudication', 'S$150,000 per claim'], ['Courts or arbitration', 'As the policy and law allow']])),
 ],
 faq=[('Is there a time limit to dispute a decision?', 'Policies and FIDReC rules set time limits. Act promptly and keep all correspondence.')],
 links=['commercial/property', 'commercial/core-liability'], sources=[FIDREC]),

dict(slug='insurance-broker-vs-agent-singapore', cat='Working with a broker', minutes=5, date=D,
 title='Insurance broker vs agent in Singapore: who acts for you and how each is paid',
 desc='The difference between an insurance broker and an agent in Singapore: who they represent, how they are regulated and how they are paid.',
 answer='An agent represents one or more insurers and sells their products. A broker represents the client, compares cover across insurers and must be registered with MAS. Brokers are usually paid commission by the insurer, sometimes a fee from the client, and disclose how they are paid.',
 sections=[
  ('Who does each represent?', ['An agent acts for the insurer. A broker acts for the business buying insurance, which matters most when terms are negotiated and when a claim is disputed.'],
   (['', 'Broker', 'Agent'], [['Acts for', 'The client', 'The insurer'], ['Insurers offered', 'Several', 'One or a few'], ['Regulation', 'Registered with MAS', 'Appointed by an insurer'], ['Typical pay', 'Commission or fee, disclosed', 'Commission from the insurer']])),
  ('When does a broker add the most?', ['When cover is complex, several insurers need comparing, or a claim needs arguing on the wording. Liability, construction, marine, cyber and employee benefits are typical examples.']),
  ('How to check a broker?', ['Confirm registration on the MAS register, ask which insurers they place with, and ask how they are paid.']),
 ],
 faq=[('Does using a broker cost more?', 'Commission is usually already built into the premium. Ask the broker to disclose how it is paid.')],
 links=['commercial/property'], sources=[MAS_BROKER]),
]
