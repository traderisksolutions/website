"""Depth content for product and solution pages, written 29 Oct 2026 against competitor pages (see each entry's competitors list).
Keys are page paths; the two renamed pages may use their old keys and are mapped in build_site.py."""

PRODUCTS = {'commercial/property': {'title': 'Commercial Property Insurance Singapore | TRS',
                         'description': 'Commercial property insurance in Singapore on a fire or industrial all risks basis: reinstatement value, the average '
                                        'clause and flood deductibles.',
                         'intro': ["Commercial property insurance pays to repair or rebuild a company's buildings, fit-out, plant, stock and contents after "
                                   'accidental physical damage. In Singapore it is written as a fire policy with extra perils, or as an industrial all risks '
                                   '(IAR) policy that covers any accidental cause the wording does not exclude. The purchase is usually forced by a lease that '
                                   'makes the tenant insure its fit-out, a bank that requires cover over a mortgaged unit, or a customer contract that asks '
                                   'for proof of insurance.',
                                   "It is not machinery breakdown, business interruption or liability cover: an IAR wording excludes a machine's own "
                                   'mechanical or electrical failure and damage done by electrical current. The policy runs for 12 months on an occurrence '
                                   'basis. The buyer declares a sum insured per item at reinstatement (new-for-new) value, accepts a deductible per claim and '
                                   'lists each address. The broker gathers the values, compares insurer wordings and extensions, places the cover and runs the '
                                   'claim with the loss adjuster.'],
                         'who': ['Tenants whose lease makes them insure the fit-out, partitions and contents of the unit.',
                                 'Owners of strata industrial or commercial units with a mortgage that requires insurance.',
                                 'Manufacturers and warehouse operators holding plant and stock in Singapore.',
                                 'Retail and F&B chains with several outlets on one schedule.',
                                 'Clinics, laboratories and offices with high-value contents and fit-out.',
                                 'Landlords insuring the shell and common areas of a multi-tenant block.'],
                         'price': [('Sum insured',
                                    'Premium is a rate applied to the declared reinstatement value, so the total value of buildings, plant, fit-out and stock '
                                    'sets the base.'),
                                   ('Construction and occupancy',
                                    'A concrete office rates lower than a timber-lined workshop; paint spraying, welding, plastics and cold storage raise the '
                                    'rate.'),
                                   ('Fire protection',
                                    'Sprinklers, hose reels, alarms and a current Fire Safety Certificate reduce the rate; missing fire certification can '
                                    'block cover.'),
                                   ('Perils and extensions',
                                    'Adding flood, landslip and subsidence, theft, plate glass and capital additions widens cover and raises premium.'),
                                   ('Deductible',
                                    'A higher deductible per claim lowers premium; insurers set separate, higher deductibles for flood and water damage.'),
                                   ('Claims history', 'Three years of paid claims and any uninsured losses are declared and rated.')],
                         'file': ['Address, floor area, construction and year built of each location',
                                  'Reinstatement values split by building, fit-out, plant, stock and contents',
                                  'Occupancy and processes carried out, including any hot work',
                                  'Fire protection in place: sprinklers, alarms, hose reels, extinguishers',
                                  'Three-year claims record with amounts paid',
                                  'Lease or mortgage clauses that set insurance requirements'],
                         'pitfalls': [('Underinsurance and average',
                                       'A sum insured below reinstatement value triggers the average clause: the insured bears a proportion of every claim, '
                                       'not only large ones. Revalue each item every year and ask for the 85% average relief clause where the insurer offers '
                                       'it.'),
                                      ('Fit-out insured by nobody',
                                       "A tenant assumes the landlord's building policy covers the partitions, ceilings and cabling it paid for; the "
                                       "landlord's policy covers the shell. Insure fit-out as a separate item at its reinstatement cost."),
                                      ('Breakdown claimed on the wrong policy',
                                       'A compressor burns out and the property claim is declined because own mechanical or electrical breakdown is excluded. '
                                       'Buy machinery breakdown cover for plant the business cannot run without.')],
                         'faqs': [('What is the difference between a fire policy and industrial all risks?',
                                   'A fire policy pays only for the perils it names: fire, lightning, explosion and any extra perils added, such as storm, '
                                   'flood or impact. An industrial all risks policy pays for any accidental physical damage unless the wording excludes it, so '
                                   'burst pipes, accidental breakage and unexplained damage are inside cover. IAR wordings still exclude wear and tear, '
                                   'gradual deterioration, own mechanical breakdown and property in transit.'),
                                  ('How is the sum insured set?',
                                   'On a reinstatement basis: the cost to rebuild or replace with new property of the same kind, including professional fees '
                                   'and debris removal where they are listed as separate items. Market value and book value are the wrong figures. Singapore '
                                   'IAR wordings carry an average clause, so a declared value below the true reinstatement cost reduces every claim in '
                                   'proportion.'),
                                  ('Does commercial property insurance cover flood in Singapore?',
                                   'Flood is a named extra peril, not automatic. Fire policies add it by endorsement; IAR wordings include it unless excluded, '
                                   'often with a separate higher deductible. Landslip and subsidence are usually a further endorsement. Basement units and '
                                   'ground-floor shophouses should confirm the flood deductible in writing before binding.'),
                                  ('Does the policy cover stock?',
                                   'Yes, as a separate item valued at cost price, not selling price. Stock that moves through the year can be insured on a '
                                   'declaration basis: a provisional premium on part of the sum insured, adjusted at expiry against monthly declarations. '
                                   'Stock in transit and stock at a third-party warehouse need their own item or a marine policy.'),
                                  ('What does the insurer need after a loss?',
                                   'Notice as soon as possible, the damaged property kept for inspection, and a written claim with repair quotations or '
                                   'invoices. For larger losses the insurer appoints a loss adjuster who checks the cause, the value at risk and the sum '
                                   'insured. Repairs should not start before the adjuster has seen the damage, except emergency work to stop further loss.'),
                                  ('Do I need SCDF approval before renovating an insured unit?',
                                   'Works that alter fire protection systems, escape routes or compartment walls need SCDF plan approval under the Fire Safety '
                                   'Act 1993, submitted by a Qualified Person. Minor works on the Regulation 4 schedule can be lodged as minor addition or '
                                   'alteration works at S$90 per submission. Tell the insurer before works start: property undergoing construction is excluded '
                                   'under IAR wordings, and the contractor needs its own contractors all risks policy.')],
                         'sources': [('Etiqa Industrial All Risks policy wording',
                                      'https://www.etiqa.com.sg/wp-content/uploads/policy_documents_and_forms/policy-wordings/Etiqa-Industrial-All-Risks-Insurance-Policy-Wording.pdf'),
                                     ('SCDF plan approval for fire safety works',
                                      'https://www.scdf.gov.sg/fire-safety-services-listing/plans-submission-process'),
                                     ('SCDF minor addition and alteration works',
                                      'https://scdf.gov.sg/home/fire-safety/plans-and-consultations/minor-addition-alteration-works')],
                         'competitors': ['dbs.com.sg/sme/services-insurance-and-advisory/insurance/property',
                                         'sleek.com/sg/property-insurance',
                                         'hlas.com.sg/propertyinsurance',
                                         'sc.com/sg/business-insurance/commercial-all-risks-insurance',
                                         'etiqa.com.sg/business-insurance/property']},
 'commercial/revenue': {'title': 'Business Interruption Insurance Singapore | TRS',
                        'description': 'Business interruption insurance in Singapore: gross profit basis, the indemnity period, increased cost of working and '
                                       'how average applies.',
                        'intro': ['Business interruption insurance replaces the gross profit a business loses while it cannot trade after physical damage to '
                                  'its premises. In Singapore it is sold as a consequential loss policy alongside a fire policy, or as Section II of an '
                                  'industrial all risks policy. Landlords rarely ask for it; banks lending against a factory sometimes do. Most buyers add it '
                                  "after a neighbour's fire, a flood or a long reinstatement shows that the property claim pays for the building and nothing "
                                  'else.',
                                  "It is not cover for a pandemic, a cyber outage, a supplier's price rise or a closure without damage: the trigger is damage "
                                  'insured under the property policy, with that insurer having paid or admitted the claim. The buyer sets a sum insured on '
                                  'gross profit, picks an indemnity period in months and accepts a time excess. The broker checks the gross profit calculation '
                                  'against the accounts, tests the indemnity period against a realistic rebuild and runs the claim with the loss adjuster.'],
                        'who': ['Manufacturers whose single plant in Singapore produces all their output.',
                                'F&B and retail groups with high rent and payroll that continue during a closure.',
                                'Logistics operators running one warehouse under a long customer contract.',
                                'Clinics, laboratories and data-heavy firms whose fit-out takes months to rebuild.',
                                'Companies with a bank covenant that requires loss of profits cover.'],
                        'price': [('Gross profit sum insured',
                                   'Premium is a rate on the gross profit insured, so turnover and the margin after variable costs set the base.'),
                                  ('Indemnity period', 'A 24-month period costs more than 12 months because the sum insured and the exposure both double.'),
                                  ('Underlying property rate',
                                   'The consequential loss rate follows the fire or IAR rate, so construction, occupancy and sprinklers move it.'),
                                  ('Dependency on one site', 'A business that can shift production to a second site or a contract manufacturer rates lower.'),
                                  ('Rebuild time',
                                   'A long reinstatement, special plant with long lead times or a cleanroom pushes the period and the price up.'),
                                  ('Extensions', 'Suppliers, customers, utilities, denial of access and wages on a dual basis each add premium.')],
                        'file': ['Last two years of audited accounts with turnover and gross profit',
                                 'List of standing charges to be insured: rent, salaries, loan interest',
                                 'Indemnity period requested, with the rebuild estimate behind it',
                                 'Underlying property policy: insurer, sum insured, perils',
                                 'Key suppliers and customers, with share of turnover',
                                 'Any alternative premises or contract production available'],
                        'pitfalls': [('Gross profit taken from the accounts',
                                      'Accounting gross profit deducts labour and overheads that continue during a closure, so the insured figure is too low '
                                      'and average cuts the claim. Use the policy definition: turnover plus closing stock, less opening stock and the working '
                                      'expenses listed as uninsured.'),
                                     ('Indemnity period that ends before trading recovers',
                                      'Twelve months covers the rebuild but not the SCDF certification, re-fit, re-hiring and winning customers back. Set the '
                                      'period from a written timeline for the worst site, then add a margin; manufacturers with imported plant usually need 18 '
                                      'or 24 months.'),
                                     ('Sum insured matched to 12 months when the period is longer',
                                      'With an 18- or 24-month indemnity period the policy compares the sum insured with gross profit multiplied for that '
                                      'period, and applies average on the shortfall. Insure the gross profit for the whole indemnity period, not for one '
                                      'year.')],
                        'faqs': [('How is a business interruption claim calculated?',
                                  'The insurer applies the rate of gross profit from the last financial year to the shortfall in turnover during the indemnity '
                                  'period, measured against the same months of the prior year and adjusted for the trend of the business. It adds increased '
                                  'cost of working spent to limit the shortfall, capped at the gross profit that spending saved, and deducts any charges that '
                                  'stopped during the closure.'),
                                 ('What is the indemnity period?',
                                  'The indemnity period starts on the date of the damage and runs until the results of the business stop being affected, up to '
                                  'the maximum stated in the schedule. It is not the policy period. The policy lasts 12 months; the indemnity period is chosen '
                                  'by the buyer and can be 12, 18, 24 or 36 months. It must cover reinstatement plus the time to recover trade.'),
                                 ('What is increased cost of working?',
                                  'Extra spending made for the sole purpose of avoiding or reducing a fall in turnover: temporary premises, overtime, '
                                  'outsourced production, express freight. The standard wording pays it only up to the gross profit it preserved, the economic '
                                  'limit. Additional increased cost of working, bought as an extension, removes that limit up to a stated sum.'),
                                 ('Does the policy cover a closure ordered by the authorities?',
                                  'Not unless there is insured damage. Singapore consequential loss wordings require physical damage at the premises insured '
                                  'under the property policy, with that insurer having paid or admitted liability. A closure for an outbreak, a government '
                                  "order or a neighbour's fire without damage to the insured premises is outside cover unless a denial of access or public "
                                  'authority extension is bought.'),
                                 ('Can staff wages be insured?',
                                  'Yes. Wages can sit inside gross profit as an insured standing charge, or be insured separately on a dual basis: 100% of '
                                  'wages for an initial number of weeks, then a lower percentage for the rest of the indemnity period, with an option to carry '
                                  'unused weeks forward. The dual basis suits manufacturers who must keep skilled staff while a plant is rebuilt.'),
                                 ('What records does the insurer need at claim time?',
                                  "Books of account, management accounts, invoices, bank statements and the auditor's certification of turnover and gross "
                                  'profit; the wording lets the insured recover reasonable auditor fees as a separate item. The written claim is due within 30 '
                                  'days after the indemnity period ends, and interim payments can be made monthly against accounts of the loss.')],
                        'sources': [('Etiqa Consequential Loss policy wording',
                                     'https://www.etiqa.com.sg/wp-content/uploads/policy_documents_and_forms/policy-wordings/Etiqa-Consequential-Loss-Policy-Wording.pdf'),
                                    ('Etiqa Industrial All Risks policy wording, Section II',
                                     'https://www.etiqa.com.sg/wp-content/uploads/policy_documents_and_forms/policy-wordings/Etiqa-Industrial-All-Risks-Insurance-Policy-Wording.pdf')],
                        'competitors': ['thekopinotes.com/?p=10451',
                                        'sleek.com/sg/property-insurance',
                                        'hlas.com.sg/propertyinsurance',
                                        'etiqa.com.sg/business-insurance/property',
                                        'chubb.com/sg-en/business/boiler-machinery-breakdown-insurance.html']},
 'commercial/car': {'title': 'Contractors All Risks Insurance Singapore | TRS',
                    'description': 'Contractors all risks insurance in Singapore: PSSCOC joint-names cover, contract sum plus fees, the defects liability '
                                   'period and fit-out works.',
                    'intro': ["Contractors all risks (CAR) insurance covers physical damage to the contract works during construction and the contractor's "
                              'legal liability to third parties on and around the site. In Singapore the purchase is forced by the contract. The Public Sector '
                              'Standard Conditions of Contract (PSSCOC), used on government projects, obliges the contractor to insure the works in the joint '
                              "names of employer and contractor before work starts, and private forms, landlords' fit-out guides and main contractors copy the "
                              'same demand.',
                              'It is not work injury compensation, professional indemnity or motor cover, and it excludes the cost of fixing defective design, '
                              'material or workmanship, though damage those defects cause to sound work is inside cover. The policy runs for the contract '
                              'period plus the defects liability period, on a sum insured equal to the full contract value and a third-party limit per '
                              'occurrence, with a deductible per claim. The broker matches the wording to the contract clause, names the parties and sets up '
                              'any annual open cover.'],
                    'who': ['Main contractors tendering for BCA, HDB, LTA or JTC projects under PSSCOC.',
                            "Interior fit-out firms working in malls, offices and shophouses under a landlord's fit-out guide.",
                            'M&E, piling, facade and specialist subcontractors required to carry their own cover.',
                            'Developers and owners arranging a project policy that names every contractor.',
                            'Renovation contractors on the HDB directory taking private residential jobs.',
                            'Firms with many small jobs a year that need an annual open cover with declarations.'],
                    'price': [('Contract value',
                               'The rate is applied to the full contract sum, including materials the principal supplies, plus professional fees and debris '
                               'removal items.'),
                              ('Type of work',
                               'Piling, basements, tunnelling, demolition and work next to existing buildings rate higher than fit-out and above-ground '
                               'structures.'),
                              ('Period and maintenance',
                               'A longer construction period and extended maintenance cover for the defects liability period cost more than maintenance visits '
                               'cover only.'),
                              ('Third-party limit',
                               'Public projects commonly require S$10 million any one occurrence; a higher limit or cover for vibration and removal of support '
                               'adds premium.'),
                              ('Deductibles', 'Higher deductibles for defective design, wet perils and underground services lower the rate.'),
                              ('Existing property',
                               "Cover for the employer's existing building on a first-loss limit, standard for fit-out and A&A work, is rated on that limit.")],
                    'file': ['Letter of award or tender with the insurance clause',
                             'Contract sum, scope of works and bill of quantities',
                             'Site address, soil conditions and neighbouring structures',
                             'Programme: start, completion and defects liability period',
                             'Method statement for piling, demolition or hot work',
                             'Names of principal, consultants and subcontractors to be insured'],
                    'pitfalls': [('Policy that stops at practical completion',
                                  'PSSCOC clause 28.1 requires the works to stay insured until 14 days after substantial completion and through the defects '
                                  'liability period for causes arising before it. A policy that ends on handover leaves the contractor in breach; buy the '
                                  'extended maintenance cover to match.'),
                                 ('Employer not a named insured',
                                  'The contract asks for joint names, cross liability and the employer noted as principal; the certificate names the '
                                  "contractor only. The employer can reject the policy and insure at the contractor's cost under clauses 27.3 and 28.1(3). "
                                  'Give the broker the clause and check the schedule against it.'),
                                 ('Fit-out contractor relying on the landlord',
                                  "A tenant's fit-out contractor assumes the building owner's property policy responds to damage it causes; it does not, and "
                                  "the landlord's insurer can recover from the contractor. Fit-out work needs its own CAR with existing property cover and the "
                                  'landlord named.')],
                    'faqs': [('What does PSSCOC require a contractor to insure?',
                              'Clause 28.1 requires the Permanent Works, Temporary Works and unfixed materials on site to be insured in the joint names of '
                              'employer and contractor for not less than the Contract Sum plus the Appendix percentage for professional fees, from before work '
                              'starts until 14 days after substantial completion and through the defects liability period. Clause 27 adds Work Injury '
                              'Compensation Act cover and third-party liability with the employer as additional insured and cross liability.'),
                             ('Is the maintenance or defects liability period covered?',
                              'Only by extension. Maintenance visits cover pays for damage the contractor causes while carrying out defects work. Extended '
                              'maintenance cover also pays for damage during the defects liability period from a cause on site before the completion '
                              'certificate was issued. PSSCOC requires the second form, so contractors on public projects should ask for extended maintenance '
                              'for the defects liability period stated in the Appendix.'),
                             ('Are defective design and workmanship covered?',
                              'The cost of replacing or repairing the defective item itself is excluded. Damage the defect causes to correctly executed parts '
                              'of the works is covered, usually with a higher deductible; one public sector clause sets it at S$15,000 or 10% of the loss, '
                              'whichever is higher. Claims against the designer for faulty design belong to professional indemnity insurance.'),
                             ('Does CAR cover my excavators, cranes and site plant?',
                              'Not automatically. PSSCOC clause 28.1 excludes tools and construction equipment from the works insurance, and the CAR wording '
                              'excludes mechanical or electrical breakdown of plant and vehicles licensed for road use. Plant is insured as a separate item '
                              'under Section I at new replacement value, or on a contractors plant and machinery policy that follows the plant from site to '
                              'site.'),
                             ('What third-party liability does the policy give?',
                              'Section II pays damages for accidental bodily injury or property damage to third parties arising from the works, on or next to '
                              'the site, plus defence costs. Damage from vibration, removal or weakening of support is excluded unless endorsed, and damage to '
                              'underground cables and pipes is covered only where the contractor checked the utility plans first. Public contracts commonly '
                              'set the limit at S$10 million any one occurrence.'),
                             ('Do I need CAR for a shop or office fit-out?',
                              "Landlords' fit-out requirements and public sector fit-out contracts ask for it; one university tender applies a S$2,000 "
                              'deductible per occurrence to fit-out and renovation contracts. The policy should name the landlord as principal, cover the '
                              "landlord's existing property on a first-loss limit and run until handover. Works that touch fire protection, escape routes or "
                              'compartments also need SCDF plan approval or a minor works lodgement.')],
                    'sources': [('BCA, PSSCOC for Construction Works 2020, clauses 27 and 28',
                                 'https://www1.bca.gov.sg/growth-and-transformation/procurement/standard-contract-forms/public-sector-standard-conditions-of-contract-psscoc/'),
                                ('NTU insurance clauses under PSSCOC, 21 Feb 2022',
                                 'https://www.ntu.edu.sg/media/docs/default-source/odfm-documents/insurance-clauses-(psscoc)---21-feb-2022c340ee16-8237-4736-ab02-53d27d4bbd40.pdf'),
                                ('Etiqa Contractors All Risks policy wording',
                                 'https://www.etiqa.com.sg/wp-content/uploads/2023/02/Etiqa_Contractors_All_Risks_Policy_Wording.pdf'),
                                ('SCDF plan approval for fire safety works', 'https://www.scdf.gov.sg/fire-safety-services-listing/plans-submission-process')],
                    'competitors': ['howdengroup.com/sg-en/insights/managing-risks-in-construction',
                                    'tokiomarine.com CAR product disclosure sheet (PDF)',
                                    'sc.com/sg/business-insurance/commercial-all-risks-insurance']},
 'commercial/equipment': {'title': 'Machinery Breakdown Insurance Singapore | TRS',
                          'description': 'Machinery breakdown insurance in Singapore: sudden internal failure from short circuit, casting defects or operator '
                                         'error, on new-for-new sums insured.',
                          'intro': ['Machinery breakdown insurance pays to repair or replace plant that fails suddenly from an internal cause: a short '
                                    'circuit, a casting defect, a bearing that seizes, a centrifugal tear, low water in a boiler, operator error. In Singapore '
                                    'it is bought by manufacturers, precision engineering shops, cold chain operators, printers, building owners with chillers '
                                    'and lifts, and clinics with imaging equipment. The trigger is usually a repair quotation that the property insurer has '
                                    'declined.',
                                    'It is not property insurance: fire, lightning, flood, theft and collapse are excluded here and belong to the fire or all '
                                    "risks policy, which in turn excludes a machine's own mechanical or electrical breakdown. Cover is annual, per machine "
                                    'listed in a schedule, at new replacement value including freight, duties and erection, with a deductible per occurrence. '
                                    'The broker aligns the two policies so no cause falls between them and adds loss of profits or stock deterioration where '
                                    'the business needs it.'],
                          'who': ['Manufacturers running CNC machines, presses, injection moulders and compressors.',
                                  'Cold stores and food processors whose refrigeration plant protects perishable stock.',
                                  'Building owners and MCSTs with chillers, lifts, generators and switchgear.',
                                  'Printers, packaging plants and component makers with high-value single machines.',
                                  'Clinics, imaging centres and laboratories with scanners and analysers out of warranty.',
                                  'Data centres and offices with UPS systems, generators and cooling plant.'],
                          'price': [('Replacement value of each machine',
                                     'Premium is a rate on the new replacement value, so the schedule total sets the base.'),
                                    ('Machine type and age',
                                     'Boilers, turbines, presses and older plant rate higher than modern packaged units; insurers may inspect first.'),
                                    ('Maintenance and service contracts',
                                     'Documented preventive maintenance and a manufacturer service contract reduce the rate; the policy requires compliance '
                                     "with manufacturers' recommendations."),
                                    ('Deductible', 'A deductible per occurrence, as a fixed sum or a percentage of the item value, lowers premium.'),
                                    ('Extensions',
                                     'Loss of profits, deterioration of stock in cold storage, express freight and overtime are each rated on top.'),
                                    ('Claims record', 'Breakdowns in the last three years, insured or not, are declared and rated.')],
                          'file': ['Schedule of machines: make, model, year, serial number, new replacement value',
                                   'Maintenance records and service contracts for the last 12 months',
                                   'Operating hours and shifts per day',
                                   'Location, foundations and any outdoor or marine exposure',
                                   'Breakdown history for three years with repair costs',
                                   'Extensions needed: loss of profits, stock deterioration, express freight'],
                          'pitfalls': [('Insuring at book value',
                                        'The wording requires the sum insured to equal the cost of a new machine of the same kind, including freight, duties '
                                        'and erection; a depreciated book value triggers proportional reduction of every claim. Ask the supplier for a current '
                                        'replacement quotation at each renewal.'),
                                       ('Claiming after the repair',
                                        'The policy pays nothing for a loss notified more than 14 days after it happened, and the insurer has the right to '
                                        'inspect before repairs start. Notify the broker the day the machine stops and keep the damaged parts.'),
                                       ('Breakdown and property policies that do not meet',
                                        'The property policy excludes own mechanical or electrical breakdown; the breakdown policy excludes fire, flood and '
                                        'theft. A motor that short-circuits and then burns leaves two insurers arguing over cause. Place both lines with one '
                                        'insurer, or agree in writing how a joint loss is split.')],
                          'faqs': [('What causes of breakdown are covered?',
                                    'Unforeseen and sudden physical damage from causes such as defects in casting and material, faulty design, faults in '
                                    'erection, bad workmanship, lack of skill, carelessness, shortage of water in boilers, physical explosion, tearing apart '
                                    'by centrifugal force and short circuit, plus any other cause the wording does not exclude. Cover applies after '
                                    'performance acceptance tests, whether the machine is working, idle, being cleaned, overhauled or moved within the '
                                    'premises.'),
                                   ('What is excluded?',
                                    'Fire, lightning, chemical explosion, theft, flood, earthquake and collapse, which belong on the property policy. Also '
                                    'excluded: wear and tear, cavitation, erosion, corrosion and boiler scale; exchangeable tools and wear parts such as dies, '
                                    'moulds, belts, ropes, tyres and refractory linings; defects known at inception; loss a supplier, contractor or repairer '
                                    'is responsible for by law or contract; and consequential loss unless a loss of profits section is added.'),
                                   ('How is a claim paid?',
                                    'If the machine can be repaired, the insurer pays the repair cost, dismantling and re-erection, and ordinary freight, with '
                                    "no deduction for depreciation on replaced parts. If the repair cost reaches the machine's actual value before the "
                                    'breakdown, it is treated as destroyed and the insurer pays that actual value, which is replacement value less '
                                    'depreciation. Overtime and express freight are paid only if agreed in writing beforehand.'),
                                   ('Does the policy cover a machine still under warranty?',
                                    'Not for failures the manufacturer, supplier or repairer is responsible for by law or under contract; those are excluded. '
                                    'Breakdown from operator error, an electrical surge inside the premises or causes outside the warranty remains covered. '
                                    'Most buyers add a machine to the schedule when its warranty expires, or insure it from day one and declare the warranty '
                                    'terms.'),
                                   ('Can I insure the production loss from a breakdown?',
                                    'Yes, as a machinery loss of profits section or a separate policy, written on the same gross profit and indemnity period '
                                    'basis as fire consequential loss. It pays the reduction in gross profit and increased cost of working during the time the '
                                    'insured machine is out of action after a covered breakdown, less any savings. Insurers set a time excess of several days '
                                    'per occurrence.'),
                                   ('Is deterioration of stock in cold rooms covered?',
                                    'Only by extension. A deterioration of stock section pays for goods in cold storage that spoil after a covered breakdown '
                                    'of the refrigeration plant, or after a failure of the public electricity supply where that extension is also bought. '
                                    'Stock must be listed with its value and the plant must be on the breakdown schedule.')],
                          'sources': [('Etiqa Machinery Breakdown policy wording',
                                       'https://www.etiqa.com.sg/wp-content/uploads/2019/09/M15-Machinery-Breakdown-Policy.pdf'),
                                      ('Etiqa Industrial All Risks policy wording, property excluded under Section I',
                                       'https://www.etiqa.com.sg/wp-content/uploads/policy_documents_and_forms/policy-wordings/Etiqa-Industrial-All-Risks-Insurance-Policy-Wording.pdf')],
                          'competitors': ['chubb.com/sg-en/business/boiler-machinery-breakdown-insurance.html',
                                          'sc.com/sg/business-insurance/machinery-all-risks-insurance',
                                          'libertyinsurance.com.sg/machinery-breakdown-insurance']},
 'commercial/electronic-equipment': {'title': 'Electronic Equipment Insurance Singapore | TRS',
                                     'description': 'Electronic equipment insurance in Singapore: all-risks cover for servers, medical and lab systems, data '
                                                    'restoration and increased cost of working.',
                                     'intro': ['Electronic equipment insurance covers sudden physical damage to computers, servers, network hardware, medical '
                                               'imaging units, laboratory analysers, building control systems and broadcast equipment. It is an engineering '
                                               'line written on an all-risks basis rather than named perils, so short circuit, voltage surge, operator error, '
                                               'water leakage and impact are inside cover. In Singapore the buyers are clinics, laboratories, data-dependent '
                                               'offices and schools, often after a lease or an equipment lessor asks for proof of cover on hardware.',
                                               'It is not cyber insurance or a maintenance contract: Singapore wordings carry an absolute cyber loss '
                                               'exclusion, and the cost of fixing functional failures or carrying out maintenance is excluded. The policy has '
                                               'three sections: material damage to the hardware, restoration of external data media, and increased cost of '
                                               'working to hire substitute equipment. Cover is annual at new replacement value per item, with a deductible per '
                                               'occurrence. The broker sets the three sums insured and confirms whether theft is added.'],
                                     'who': ['Clinics, dental practices and imaging centres with scanners, X-ray units and analysers.',
                                             'Laboratories and test houses with calibrated instruments.',
                                             'Offices, law firms and agencies whose servers and workstations run the business.',
                                             'Schools and training centres with large fleets of computers and AV equipment.',
                                             'Data centres, telecoms rooms and broadcast studios.',
                                             "Companies leasing equipment under a contract that requires insurance in the lessor's name."],
                                     'price': [('New replacement value',
                                                'Premium is a rate on the total replacement value of the listed items, including freight, duties and '
                                                'installation.'),
                                               ('Equipment class',
                                                'Medical and laboratory systems, broadcast gear and portable equipment rate higher than fixed office '
                                                'hardware.'),
                                               ('Environment',
                                                'Air-conditioned rooms, surge protection, UPS and raised floors reduce the rate; a basement or ground-floor '
                                                'room raises it.'),
                                               ('Theft and portable items',
                                                'Adding theft and cover away from the premises for laptops and field instruments adds premium.'),
                                               ('Data media and increased cost of working',
                                                'The sums insured chosen for restoring data and hiring substitute equipment are rated separately.'),
                                               ('Deductible and time excess',
                                                'A higher material damage deductible and a longer time excess on increased cost of working lower the rate.')],
                                     'file': ['Equipment list: make, model, year, serial number, replacement value',
                                              'Location of each item and the room conditions',
                                              'Maintenance contracts and backup procedures',
                                              'Daily cost of substitute equipment and the indemnity period wanted',
                                              'Value needed to replace data media and reproduce data',
                                              'Claims in the last three years'],
                                     'pitfalls': [('Assuming theft is covered',
                                                   'The standard electronic equipment wording in Singapore excludes loss or damage caused by theft; a stolen '
                                                   'server is not a claim. Add theft by endorsement, or insure portable items under a separate all risks '
                                                   'policy.'),
                                                  ('Data media without a backup routine',
                                                   'Section 2 pays to replace media and reproduce data only for costs incurred within 12 months, and excludes '
                                                   'loss from false programming or inadvertent deletion. Set the sum insured at the real cost of '
                                                   'reconstruction and keep an off-site backup, or the section pays for blank media only.'),
                                                  ('Increased cost of working set too low',
                                                   'The sum insured for Section 3 must equal 12 months of substitute equipment at the agreed daily rate; a low '
                                                   'figure is scaled back in proportion when the hire runs long. Price the daily rental of a like-for-like '
                                                   'system before setting the sum.')],
                                     'faqs': [('What is the difference between electronic equipment and machinery breakdown insurance?',
                                               'Machinery breakdown covers internal failures of mechanical and electrical plant and excludes external perils. '
                                               'Electronic equipment insurance is all risks: it covers external causes such as water, impact, fire and short '
                                               'circuit as well as internal failure, for low-voltage electronic systems. The two are not interchangeable; a '
                                               'chiller belongs on breakdown, a CT scanner on electronic equipment.'),
                                              ('Does it cover power surges and voltage fluctuation?',
                                               'Damage from short circuit, over-voltage or arcing inside the premises is covered as a sudden physical cause. '
                                               'Loss from the failure or interruption of the public electricity, gas or water supply is excluded in the '
                                               'standard wording, so an outage that corrupts a process without physical damage is not a claim. Install surge '
                                               'protection and a UPS; insurers ask about both.'),
                                              ('How is a destroyed item valued?',
                                               'The insurer pays the actual value immediately before the loss, which is the new replacement value less '
                                               'depreciation, plus dismantling, freight and installation where they are in the sum insured. Repairable damage '
                                               'is paid at repair cost with no depreciation on replaced parts. A full replacement value endorsement, where the '
                                               'insurer offers it, removes the depreciation deduction; ask for it on equipment under three years old.'),
                                              ('What does the data media section pay?',
                                               'The cost of replacing damaged external data media with new material and reproducing the lost information, '
                                               'after material damage covered under Section 1, limited to expenses incurred within 12 months of the event. If '
                                               'the data is not reproduced in that time, only the blank media is paid. Costs from false programming, '
                                               'inadvertent deletion or magnetic fields are excluded. Cover applies while the media is at the premises.'),
                                              ('What is increased cost of working under this policy?',
                                               'The extra spent to use substitute equipment after covered damage interrupts the insured system: hire of '
                                               "replacement servers, time on another facility's scanner, outsourced processing. It pays an agreed sum per day "
                                               'up to the annual sum insured, after a time excess, and only from the day the substitute is in use. Personnel '
                                               'and transport costs are added where separate sums are listed.'),
                                              ('Is equipment on lease or hire covered?',
                                               'Rented or hired equipment is excluded where the owner is responsible for it by law or under the lease or '
                                               'maintenance agreement. Where the lease puts the risk on the user, the item is listed with the lessor noted as '
                                               'loss payee. Check the lease: most require the lessee to insure at full replacement value and to name the '
                                               'lessor.')],
                                     'sources': [('Etiqa Electronic Equipment policy wording',
                                                  'https://www.etiqa.com.sg/wp-content/uploads/2019/09/M13-Electronic-Equipment.pdf'),
                                                 ('Etiqa Machinery Breakdown policy wording',
                                                  'https://www.etiqa.com.sg/wp-content/uploads/2019/09/M15-Machinery-Breakdown-Policy.pdf')],
                                     'competitors': ['chubb.com/sg-en/business/boiler-machinery-breakdown-insurance.html',
                                                     'sc.com/sg/business-insurance/machinery-all-risks-insurance',
                                                     'etiqa.com.sg/policy-wordings']},
 'commercial/specialized': {'title': 'Contractors Plant & Machinery Insurance Singapore | TRS',
                            'description': 'Contractors plant and machinery insurance in Singapore: cranes, excavators and forklifts insured site to site at '
                                           'new replacement value.',
                            'intro': ['Contractors plant and machinery (CPM) insurance covers mobile cranes, crawler cranes, excavators, piling rigs, '
                                      'forklifts, boom lifts and other site plant against sudden accidental damage wherever they work in Singapore, whether '
                                      'owned or hired in. The purchase is forced by the contract: PSSCOC excludes construction equipment from the works '
                                      'insurance and public tenders require the contractor to insure its own plant, while plant hire agreements put the risk '
                                      'on the hirer from delivery to return.',
                                      'It is not motor insurance, which the Motor Vehicles (Third-Party Risks and Compensation) Act requires for anything used '
                                      'on a public road, and it is not breakdown cover: internal mechanical or electrical failure is excluded, though external '
                                      'damage that follows a breakdown is paid. Cover is annual, per item on a schedule, at new replacement value, with a '
                                      'deductible per occurrence. The broker adds transit, hired-in plant, third-party liability and road risks where the '
                                      'fleet needs them.'],
                            'who': ['Crane and plant hire companies with fleets working on several sites at once.',
                                    'Main contractors and piling, demolition and civil subcontractors that own heavy plant.',
                                    'Logistics and port operators running forklifts, reach stackers and container handlers.',
                                    'Shipyards, steel fabricators and precast yards with gantry cranes and mobile plant.',
                                    'Contractors hiring in plant under agreements that make them responsible for loss or damage.',
                                    'Owners of specialised units: concrete pumps, drilling rigs, mobile elevating work platforms.'],
                            'price': [('Replacement value of the fleet',
                                       'Premium is a rate on the new replacement value of each listed item, so fleet size and age set the base.'),
                                      ('Plant type',
                                       'Cranes, piling rigs and plant working near water or underground rate higher than forklifts and compressors.'),
                                      ('Where it works',
                                       'Plant on marine, reclamation or tunnelling sites, or in transit between sites, needs endorsements that add premium.'),
                                      ('Operator and maintenance records',
                                       'Registered lifting equipment with current Authorised Examiner certificates and trained operators supports a lower '
                                       'rate.'),
                                      ('Deductible', 'A deductible per occurrence, often a percentage of the item value with a minimum sum, lowers premium.'),
                                      ('Extensions',
                                       'Hired-in plant, third-party liability, overtime and express freight, and road risks are each rated on top.')],
                            'file': ['Plant schedule: type, make, model, year, serial number, new replacement value',
                                     'MOM registration and Authorised Examiner certificates for lifting equipment',
                                     'Sites or areas where the plant will work, including marine or underground',
                                     'Hire agreements for plant hired in, showing who bears the risk',
                                     'Operator licences and lifting supervisor training records',
                                     'Loss history for three years, including theft'],
                            'pitfalls': [('Road-licensed plant with no motor policy',
                                          'The CPM wording excludes vehicles licensed for general road use unless they work only on sites, and the Motor '
                                          'Vehicles (Third-Party Risks and Compensation) Act requires a motor policy for road use. Lorry cranes and mobile '
                                          'cranes that drive between sites need motor cover for the road and CPM for the lift.'),
                                         ('Transit between sites assumed covered',
                                          'The standard wording excludes loss or damage while in transit unless endorsed, so an excavator that slides off a '
                                          "low-loader is not a claim. Add inland transit, or insure the move under the haulier's or a marine policy."),
                                         ("Plant hired in on the hirer's risk, insured by nobody",
                                          'Hire agreements make the hirer responsible for the plant from delivery to return; the hirer assumes the owner '
                                          "insured it, and the owner's policy excludes items on hire. List hired-in plant on the CPM schedule or buy a "
                                          'hired-in plant extension with a limit that matches the largest unit.')],
                            'faqs': [('Does the policy follow the plant from site to site?',
                                      'Yes, within the geographical area stated in the schedule, usually Singapore, whether the item is working, at rest, or '
                                      'being dismantled, overhauled or re-erected. It responds only after the item has been commissioned. Transit between '
                                      'sites is excluded unless endorsed, and plant working underground or in tidal waters needs a specific endorsement.'),
                                     ('Is mechanical breakdown covered?',
                                      'No. Electrical or mechanical breakdown, failure, breakage, freezing of coolant and lack of lubrication are excluded. If '
                                      'the breakdown causes an accident with external damage, for example a boom that collapses after a hydraulic failure, the '
                                      'resulting external damage is paid. Breakdown of the plant itself needs a machinery breakdown policy.'),
                                     ('How is a claim settled?',
                                      'Repairable damage is paid at repair cost plus dismantling, re-erection and ordinary freight, with no deduction for '
                                      'depreciation on parts replaced. If repair cost reaches the actual value of the item before the loss, it is a total loss '
                                      'and the insurer pays that actual value, which is replacement value less depreciation. Notice must reach the insurer '
                                      'within 14 days of the loss, and the police must be informed for theft.'),
                                     ('What does MOM require for cranes and lifting plant?',
                                      'Lifting machines, lifts and hoists, lifting appliances and lifting gear must be registered with MOM through an '
                                      'Authorised Examiner, who tests the equipment, issues the examination report and registers it. Examples include mobile, '
                                      'crawler, tower and gantry cranes, lorry loaders, piling frames, mobile elevating work platforms and gondolas. Equipment '
                                      'is re-examined at the intervals set by the Workplace Safety and Health (General Provisions) Regulations or by the '
                                      'examiner. Insurers ask for the current certificate.'),
                                     ('Does CPM cover third-party injury or damage caused by the plant?',
                                      'Not under the standard wording, which pays for damage to the insured items only. Liability for a crane load that '
                                      'strikes a neighbouring building or a forklift that injures a visitor sits under the public liability policy or Section '
                                      "II of the project's CAR. Plant owners who hire out with operators buy a separate third-party liability section with its "
                                      'own limit.'),
                                     ('Can I insure a single high-value unit rather than the whole fleet?',
                                      'Yes. Each item is insured separately with its own sum insured and deductible, and average applies item by item, so a '
                                      'schedule can carry one tunnel boring machine, one concrete pump or one crawler crane. Insurers inspect single '
                                      'high-value units before cover and may set operating conditions. Premium is due within 60 days of inception under the '
                                      'premium payment warranty, or cover terminates.')],
                            'sources': [('Etiqa Contractor Plant and Machinery policy wording',
                                         'https://www.etiqa.com.sg/wp-content/uploads/policy_documents_and_forms/policy-wordings/Etiqa-Contractor-Plant-Machinery-Policy-Wording.pdf'),
                                        ('MOM, register lifting equipment',
                                         'https://www.mom.gov.sg/workplace-safety-and-health/lifting-equipment/register-lifting-equipment'),
                                        ('MOM, regular inspections for lifting equipment',
                                         'https://www.mom.gov.sg/workplace-safety-and-health/lifting-equipment/regular-inspections'),
                                        ('BCA, PSSCOC for Construction Works 2020, clause 28.1',
                                         'https://www1.bca.gov.sg/growth-and-transformation/procurement/standard-contract-forms/public-sector-standard-conditions-of-contract-psscoc/')],
                            'competitors': ['chubb.com/sg-en/business/marine/plant-and-machinery-insurance.html',
                                            'sc.com/sg/business-insurance/machinery-all-risks-insurance',
                                            'howdengroup.com/sg-en/insights/managing-risks-in-construction']},
 'commercial/financial-assets': {'title': 'Trade Credit Insurance Singapore | TRS',
                                 'description': 'Trade credit insurance in Singapore for unpaid B2B invoices after buyer insolvency, protracted default or '
                                                'political events. Insurers pay up to 90%.',
                                 'intro': ['Trade credit insurance pays when a business customer does not pay. The policy covers invoices issued on '
                                           'open-account terms, usually with payment due within 12 months. Singapore exporters, commodity traders, '
                                           'distributors and manufacturers buy it when one buyer is a large share of receivables, when a bank asks for insured '
                                           'receivables before lending against them, or when sales move into markets where buyer information is thin. '
                                           "Receivables can be 40% of a company's balance sheet assets, so the exposure is rarely small.",
                                           'It is not a guarantee of every invoice. Cover applies only to buyers with a credit limit in place, and the insurer '
                                           'pays an insured percentage, commonly 75% to 90% of the debt. Policies run for one year on a whole-turnover, '
                                           'key-account, single-risk or excess-of-loss basis, priced as a rate on insured sales. The broker structures the '
                                           'policy, obtains buyer limits from the insurer, sets up the loss-payee wording a bank requires, and manages overdue '
                                           'reporting and claims.'],
                                 'who': ['Exporters selling on open account into Asean, China, India or the Middle East.',
                                         'Commodity and electronics traders with one buyer carrying a large share of receivables.',
                                         'Distributors and wholesalers giving 60 to 90 day terms to retailers and contractors.',
                                         'Companies whose bank will lend more against receivables insured with a loss-payee clause.',
                                         'Firms with sales above S$5 million a year, the scale at which insurers quote most readily.',
                                         'Suppliers entering multi-year contracts or new markets with limited buyer information.'],
                                 'price': [('Insured turnover',
                                            'Premium is a rate applied to insured sales; Marsh Singapore puts the cost at below 1% of revenue for most '
                                            'portfolios.'),
                                           ('Buyer quality and spread',
                                            'A portfolio of many rated buyers prices lower than one with a few weak or unrated buyers; concentration raises '
                                            'the rate and the deductible.'),
                                           ('Countries sold into',
                                            'Export buyers in markets with transfer restrictions or weak insolvency regimes attract a political risk loading '
                                            'and lower limits.'),
                                           ('Payment terms',
                                            'Longer terms increase the exposure the insurer carries; terms longer than those on the policy schedule need the '
                                            "insurer's agreement before the sale."),
                                           ('Loss history',
                                            'Past bad debts set the starting point for the rate, the deductible and any aggregate first loss the insured '
                                            'keeps.'),
                                           ('Insured percentage and structure',
                                            'A 90% indemnity costs more than 80%; excess-of-loss and key-account structures cut premium by leaving smaller '
                                            'buyers uninsured.')],
                                 'file': ['Sales turnover and bad-debt history for recent years',
                                          'Aged receivables ledger by buyer and country',
                                          'List of largest buyers with the credit limits requested',
                                          'Standard payment terms and the credit control procedure',
                                          'Audited accounts and any existing financing against receivables',
                                          'Details of disputed, overdue or previously claimed debts'],
                                 'pitfalls': [('Trading above the limit',
                                               'Cover stops at the credit limit on each buyer, and shipments above it are uninsured. Apply for an increase '
                                               'before the order is accepted, and use the discretionary limit only with the justification the policy names.'),
                                              ('Assigning the policy without consent',
                                               'In Marketlend v QBE Insurance (Singapore) [2025] SGHC(I) 1 the claim failed because the policy had been '
                                               "assigned to a financier without the insurer's written consent. Ask the insurer for a loss-payee endorsement or "
                                               'written consent before any receivables financing is signed.'),
                                              ('Late overdue reporting',
                                               'Policies set a deadline to report an overdue account and to stop shipping, and missing it voids the claim on '
                                               'that buyer. Put the policy dates into the credit control calendar and report on time even when the buyer '
                                               'promises payment.')],
                                 'faqs': [('How much of an unpaid invoice does trade credit insurance pay?',
                                           "The policy pays an insured percentage of the debt, not the whole amount. Allianz Trade's Singapore FAQ quotes up "
                                           'to 90%; Marsh Singapore cites 75% to 90% as the usual range. Payment is also capped at the credit limit held on '
                                           'that buyer, so a S$500,000 debt against a S$300,000 limit at 90% pays S$270,000. The uninsured share keeps the '
                                           "seller's own credit control in play."),
                                          ('What is the difference between insolvency and protracted default?',
                                           'Insolvency is a legal event: liquidation, judicial management, bankruptcy or a scheme of arrangement. Protracted '
                                           'default is a buyer that is still trading but has not paid within the agreed terms. Insolvency claims are paid once '
                                           "the event is proved. Protracted default claims are paid after a waiting period; Allianz Trade's regional FAQs cite "
                                           'about five to six months from claim filing, and Atradius names six months as normal.'),
                                          ('How do buyer credit limits and discretionary limits work?',
                                           'Each buyer needs a limit in place before a loss. An approved limit is set by the insurer after it assesses the '
                                           'buyer. A discretionary limit lets the seller set its own limit up to a threshold, justified by a recent credit '
                                           "report, the insurer's credit opinion or trading experience within the justification period. Insurers can cut or "
                                           'withdraw approved limits on adverse news, usually with 30 days notice; goods shipped before that date stay '
                                           'covered.'),
                                          ('Does the policy cover export sales and political risk?',
                                           'Yes, when the export markets are declared and the political risk extension is included. Political risk covers '
                                           "non-payment caused by events in the buyer's country: war, government cancellation of a contract, import or export "
                                           'bans, or currency transfer restrictions that stop a solvent buyer paying. Each country carries its own limit and '
                                           'rate, and sanctioned countries are excluded.'),
                                          ('Can a bank lend against insured receivables?',
                                           'Banks lend more readily against receivables that are insured, and some make it a condition of invoice financing. '
                                           "The usual mechanism is a loss-payee endorsement naming the bank, or the insurer's written consent to an assignment "
                                           "of policy proceeds. Doing either without the insurer's consent breaches the policy; the Singapore International "
                                           'Commercial Court dismissed a trade credit claim on that ground in January 2025.'),
                                          ('Is there government support for trade credit insurance premiums in Singapore?',
                                           'Enterprise Singapore has run a Trade Credit Insurance Scheme that paid 50% of the minimum premium on policies from '
                                           'Singapore-registered credit insurers, capped at S$100,000 per company in aggregate, for firms with group turnover '
                                           'of S$100 million or less and paid-up capital of at least S$50,000. The last published extension ran to 31 March '
                                           '2021. Confirm current availability with Enterprise Singapore before budgeting for it.')],
                                 'sources': [('Allianz Trade Singapore FAQ',
                                              'https://www.allianz-trade.com/en_SG/trade-credit-insurance/what-is-trade-credit-insurance/faq.html'),
                                             ('Enterprise Singapore (IE Singapore) TCIS and PRIS terms, 2015',
                                              'https://www.enterprisesg.gov.sg/-/media/esg/files/financial-assistance/loans-insurance/ifs-moe/gcp_accesstofinancing_mar2015.pdf'),
                                             ('Marketlend v QBE Insurance (Singapore) [2025] SGHC(I) 1', 'https://www.elitigation.sg/gd/s/2025_SGHCI_1'),
                                             ('Allianz Trade: discretionary and approved limits',
                                              'https://www.allianz-trade.com/en_GB/support/help-and-support/managing-your-policy/understanding-discretionary-limits.html')],
                                 'competitors': ['allianz-trade.com/en_SG/trade-credit-insurance/small-and-medium-enterprise/allianz-trade-credit-insurance.html',
                                                 'allianz-trade.com/en_SG/trade-credit-insurance/what-is-trade-credit-insurance/faq.html',
                                                 'allianz-trade.com/en_SG/insights/risk-management/your-ultimate-guide-to-trade-credit-insurance-a-qa-with-allianz-trade-experts.html',
                                                 'marsh.com/sg/services/trade-credit.html',
                                                 'marsh.com/sg/services/trade-credit/products/trade-credit-insurance.html',
                                                 'aon.com/singapore/tcis (TCIS scheme PDF)',
                                                 'atradius.co.uk/knowledge-and-research/blog/a-credit-limit-or-an-indication-what-do-i-need',
                                                 'hfw.com/insights/marketlend-v-qbe-warning-trade-finance-banks']},
 'commercial/inventory': {'title': 'Marine Cargo Insurance Singapore | TRS',
                          'description': 'Marine cargo insurance Singapore: Institute Cargo Clauses A, B and C, open cover, Incoterms, general average and the '
                                         '60-day transit limit explained.',
                          'intro': ['Marine cargo insurance pays for physical loss of or damage to goods while they move by sea, air or road, from the '
                                    "seller's warehouse to the buyer's. Singapore importers, exporters, commodity traders and freight forwarders buy it "
                                    "because the carrier's liability is capped by convention, a letter of credit calls for an insurance certificate, or the "
                                    'sale contract puts the risk of the voyage on them. Cover follows the goods through loading, transhipment and discharge.',
                                    "It is not cover for late delivery, loss of market or the carrier's own liability. Cover is bought on Institute Cargo "
                                    'Clauses (A), (B) or (C), for a single shipment or on an open cover that insures every declared shipment for a year, with '
                                    'the sum insured usually set at the CIF value plus 10%. The broker matches the clauses to the goods and the Incoterms, '
                                    'places the open cover, issues certificates, and runs claims, general average and recoveries against carriers.'],
                          'who': ['Importers buying on FOB, FCA or EXW terms, where the buyer carries transit risk.',
                                  'Exporters selling CIF or CIP, who must insure the shipment for the buyer.',
                                  'Commodity traders moving metals, grain, oil or chemicals through Singapore.',
                                  'Freight forwarders and 3PLs offering shipment cover to their customers.',
                                  'Manufacturers importing machinery or project cargo that needs lifting and installation.',
                                  'Banks and trade financiers requiring an assigned certificate under a letter of credit.'],
                          'price': [('Commodity and packing',
                                     'Fragile, theft-attractive or temperature-sensitive goods rate higher than containerised dry cargo; poor packing is '
                                     'excluded, not rated.'),
                                    ('Clauses chosen',
                                     'ICC (A) all-risks cover costs more than (B) or (C) named perils; war and strikes clauses add a separate rate by voyage.'),
                                    ('Route and mode',
                                     'Air freight rates lower than sea; voyages through high-risk waters or transhipment hubs add war premium and survey '
                                     'conditions.'),
                                    ('Sum insured and limits',
                                     'Value per conveyance drives capacity; Singapore facilities quote per-shipment limits from US$10 million (Marsh '
                                     'CargoSecure) to US$25 million (Chubb).'),
                                    ('Annual turnover and declarations',
                                     'Open covers price a rate on declared annual shipment value, adjusted at year end on actual declarations.'),
                                    ('Claims record',
                                     'Past transit losses, especially theft and non-delivery, set the deductible and whether survey warranties apply.')],
                          'file': ['Description of goods, packing and average value per shipment',
                                   'Annual shipment value split by sea, air and road',
                                   'Main origins, destinations and transhipment ports',
                                   'Incoterms used for purchases and for sales',
                                   'Storage points and any period goods sit at port or in 3PL warehouses',
                                   'Loss record and any current cargo policy wording'],
                          'pitfalls': [("Relying on the seller's CIF cover",
                                        'Under Incoterms 2020 a CIF seller only has to buy ICC (C), which covers fire, sinking, collision and jettison but not '
                                        'theft, water damage or handling loss. Buy your own ICC (A) cover, or a difference-in-conditions policy, for anything '
                                        'above basic risk.'),
                                       ('Letting the transit clause run out',
                                        'Cover ends 60 days after discharge at the final port, or earlier when goods go into storage for allocation or '
                                        'distribution. Declare storage periods and arrange a storage extension before the goods arrive.'),
                                       ('Treating carrier liability as insurance',
                                        "A sea carrier's liability under the Hague-Visby Rules is 666.67 SDR per package or 2 SDR per kilogram, whichever is "
                                        "higher; an airline's is 26 SDR per kilogram. Insure the goods at full value and let the insurer pursue the carrier "
                                        "under the policy's recovery clause.")],
                          'faqs': [('What is the difference between Institute Cargo Clauses A, B and C?',
                                    'ICC (A) covers all risks of physical loss or damage except the listed exclusions, so the insured only has to show a '
                                    'fortuitous loss. ICC (B) and (C) cover named perils only. (C) covers fire, explosion, stranding, sinking, collision, '
                                    'discharge at a port of distress, general average and jettison. (B) adds earthquake, lightning, washing overboard, entry '
                                    'of sea or river water and total loss of a package during loading. Theft, non-delivery, rain and handling damage need '
                                    '(A).'),
                                   ('Who insures the goods under each Incoterm?',
                                    "Only CIF and CIP oblige the seller to insure, and the cover is for the buyer's benefit. Incoterms 2020 sets CIF at ICC "
                                    '(C) as the minimum and CIP at ICC (A), for the contract price plus 10%. Under EXW, FCA, FOB and CFR the buyer carries '
                                    'transit risk and buys its own policy. Under DAP, DPU and DDP the seller carries the risk to delivery and should insure, '
                                    'though the rules do not require it.'),
                                   ('Open cover or single shipment: which should a regular importer use?',
                                    'A single-shipment policy suits occasional consignments: one voyage, one certificate, paid up front. An open cover suits '
                                    'regular shippers: it insures every shipment within agreed goods, routes and limits for 12 months, with shipments declared '
                                    'periodically and premium adjusted on actual value. It removes the risk of an undeclared shipment travelling uninsured and '
                                    'lets the broker issue certificates for letters of credit as shipments are booked.'),
                                   ('What is general average and why does the policy mention it?',
                                    'General average is a rule of maritime law: when the master sacrifices cargo or incurs expense to save the ship, every '
                                    'cargo owner contributes in proportion to the value saved. The carrier will not release goods until each owner posts '
                                    'security. ICC (A), (B) and (C) all cover the contribution, and the insurer issues the general average guarantee so the '
                                    'goods are released.'),
                                   ('Does cargo insurance cover goods in storage or at a port?',
                                    'Only while storage is part of the ordinary course of transit. Under the 2009 clauses cover attaches when goods are first '
                                    'moved in the warehouse for loading and ends on unloading at the final warehouse, when goods go into storage for '
                                    'allocation, or 60 days after discharge at the final port, whichever is first. Longer storage needs a declared extension '
                                    'or a stock throughput policy.'),
                                   ('How is a cargo claim handled and what proof is needed?',
                                    'Notify the broker and the carrier at once, keep the damaged goods and packing, and ask for a joint survey before anything '
                                    'is moved. The claim file needs the policy or certificate, invoice, packing list, bill of lading or air waybill, the '
                                    "survey report and the carrier's reply to a written claim. In Sizer Metals v Chubb [2022] SGHC 51 the court held the "
                                    'insured must show, on the balance of probabilities, that the loss occurred inside the insured transit.')],
                          'sources': [("Lloyd's Agency cargo claims manual (Institute Cargo Clauses 2009)",
                                       'https://assets.lloyds.com/media/b9ed5b23-6f71-48d4-87d7-e218a0e69c1e/pdf-how-we-train-and-examine-lloyds-agents-2019-Sept-Cargo-Claims-and-Recoveries-Manual.pdf'),
                                      ('ICC Incoterms 2020', 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/'),
                                      ('Hague-Visby Rules, Article IV rule 5 (UK COGSA 1971 Schedule)',
                                       'https://www.legislation.gov.uk/ukpga/1971/19/schedule'),
                                      ('FIATA: Montreal Convention limits from 28 December 2024',
                                       'https://fiata.org/n/air-freight-alert-revision-of-liability-limits-und/')],
                          'competitors': ['msig.com.sg/node/689 (marine cargo)',
                                          'chubb.com/sg-en/business/marine/cargo-insurance.html',
                                          'chubb.com/sg-en/business/cargo-liability-insurance.html',
                                          'sc.com/sg/business-insurance/business-protection-insurance/marine-cargo-insurance (MSIG-underwritten)',
                                          'howdengroup.com/sg-en/cover/marine-cargo-insurance',
                                          'marsh.com/sg/services/small-business-insurance/products/cargosecure.html',
                                          'insurance.hsbc.com.sg discontinuation-motor-commercial-faq.pdf (HSBC Life ceased marine 30 March 2022)',
                                          'elitigation.sg/gd/s/2022_SGHC_51 (Sizer Metals v Chubb)']},
 'commercial/stock-throughput': {'title': 'Stock Throughput Insurance Singapore | TRS',
                                 'description': 'Stock throughput insurance Singapore: one marine policy for inventory in transit, in process and in storage, '
                                                'with per-location limits and flat deductibles.',
                                 'intro': ['Stock throughput insurance is a marine cargo policy extended to cover inventory while it is stored, not only while '
                                           'it moves. One policy follows raw materials, work in progress and finished goods from supplier to warehouse to '
                                           'customer, at owned sites and third-party logistics (3PL) warehouses worldwide. Singapore distributors, electronics '
                                           'and pharmaceutical manufacturers and commodity traders buy it when stock passes through several hands and separate '
                                           'cargo and property policies leave a gap at each handover.',
                                           'It is not a replacement for property insurance on buildings, plant or business interruption, and damage caused by '
                                           'the manufacturing process itself is excluded. The policy is bought on all-risks cargo conditions with a limit per '
                                           'location and per conveyance, an annual aggregate for flood, windstorm and earthquake, and a single rate applied to '
                                           'sales or stock values declared through the year. The broker maps every storage point, agrees valuation and '
                                           'deductibles by stage, and removes stock from the property policy so that limit can fall.'],
                                 'who': ['Importers and distributors holding stock in 3PL warehouses in Singapore, Malaysia and China.',
                                         'Electronics, semiconductor and medical device makers with high-value components in transit and in store.',
                                         'Commodity traders with cargo at port, in bonded warehouses and on vessels at the same time.',
                                         'Retail groups moving stock from distribution centres to many outlets.',
                                         'Companies whose property insurer imposes percentage deductibles on stock for flood or storm.',
                                         'Exporters with consignment stock held at customer sites overseas.'],
                                 'price': [('Peak stock value by location',
                                            'The highest value at any one site sets the per-location limit and the catastrophe aggregate; concentration in one '
                                            'warehouse raises the rate.'),
                                           ('Annual sales or throughput',
                                            'Premium is a single rate on declared sales or stock values, adjusted at year end; higher turnover on the same '
                                            'peak stock lowers the effective rate.'),
                                           ('Goods and process',
                                            'Theft-attractive, perishable or temperature-controlled goods rate higher; processing stages are covered but '
                                            'process damage is excluded.'),
                                           ('Warehouse quality',
                                            'Sprinklers, alarms, flood height and 3PL contract terms move the rate and decide whether a location is accepted '
                                            'at full limit.'),
                                           ('Deductible structure',
                                            'Flat-dollar deductibles by stage replace percentage property deductibles; a higher deductible on static stock '
                                            'cuts premium more than one on transit.'),
                                           ('Territories and catastrophe exposure',
                                            'Locations in flood, typhoon or earthquake zones carry annual aggregate sublimits and a loading on the rate.')],
                                 'file': ['Schedule of every storage location with peak and average stock values',
                                          'Annual sales and purchases split by transit and storage',
                                          'Goods description, packing and temperature requirements',
                                          'Warehouse construction, fire protection and security at each site',
                                          '3PL contracts showing who bears risk and any liability caps',
                                          'Current cargo and property policy wordings and the loss record'],
                                 'pitfalls': [('Leaving stock on the property policy',
                                               'Insuring the same stock under both policies creates a contribution dispute at claim time and pays premium '
                                               'twice. Remove stock from the property sum insured once the stock throughput policy incepts, and tell both '
                                               'insurers in writing.'),
                                              ('Missing a location',
                                               'A warehouse not on the schedule has no limit, and an unscheduled 3PL site may be uninsured. Review the '
                                               'location schedule each quarter and declare new sites before stock moves in.'),
                                              ('Assuming the 3PL is liable',
                                               "Standard trading conditions cap a logistics provider's liability at a few dollars per kilogram, far below "
                                               "stock value. Insure the stock yourself and let the insurer recover against the 3PL under the policy's "
                                               'subrogation clause.')],
                                 'faqs': [('How does stock throughput differ from marine cargo plus property insurance?',
                                           'A cargo policy ends when goods are unloaded at the final warehouse, or 60 days after discharge at the final port. '
                                           'A property policy covers stock only at named premises, often with percentage deductibles and exclusions for goods '
                                           "in a third party's care. Stock throughput joins the two: ocean cargo, inland transit and storage under one "
                                           'all-risks wording, one valuation basis and one deductible structure, so no handover is uninsured.'),
                                          ('Is stock in a 3PL warehouse covered?',
                                           'Yes, when the site is on the location schedule and within its limit. Property insurance often excludes delay, '
                                           "damage or theft while goods are in a third party's possession; a stock throughput policy is written to include it. "
                                           "The insurer will ask for the 3PL contract, the warehouse's fire and security standards and the value held there at "
                                           'peak.'),
                                          ('How is stock valued at claim time?',
                                           'The valuation clause sets it. Raw materials are usually valued at replacement cost plus freight and duty; finished '
                                           'goods can be valued at selling price less costs not incurred, which protects the margin a property policy would '
                                           'not pay. The basis is agreed at inception for each category of stock and should match how stock is carried in the '
                                           'accounts.'),
                                          ('What limits and deductibles apply?',
                                           'The policy carries a limit per location, a limit per conveyance and an annual aggregate for catastrophe perils '
                                           'such as flood, windstorm and earthquake. Deductibles are flat dollar amounts that can differ by stage: lower on '
                                           'transit, higher on static stock in a sprinklered warehouse. This replaces the percentage-of-sum-insured deductible '
                                           'that property policies apply to stock.'),
                                          ('Does it cover goods while being processed?',
                                           "Goods are covered while in process at the insured's premises, but damage caused by the manufacturing process "
                                           'itself, such as a failed batch or a machine fault, is excluded. Fire, flood, theft or impact during processing is '
                                           'covered. Manufacturers with high-value work in progress should check the process exclusion wording and the limit '
                                           'at the production site.'),
                                          ('Which Singapore companies qualify?',
                                           'Insurers write stock throughput for companies with regular transit flows and meaningful static stock: importers, '
                                           'distributors, manufacturers and traders with inventory at more than one site. There is no fixed minimum, but the '
                                           'policy is priced on a single rate across sales, so a business with little transit and all stock in one owned '
                                           'warehouse is usually better served by a property policy.')],
                                 'sources': [('Marsh: stock throughput policy', 'https://www.marsh.com/ph/industries/cargo/products/stock-throughput.html'),
                                             ('Munich Re: stock throughput insurance',
                                              'https://www.munichre.com/en/insights/mobility-and-transport/stock-throughput-insurance.html'),
                                             ("Lloyd's Agency cargo claims manual (transit clause)",
                                              'https://assets.lloyds.com/media/b9ed5b23-6f71-48d4-87d7-e218a0e69c1e/pdf-how-we-train-and-examine-lloyds-agents-2019-Sept-Cargo-Claims-and-Recoveries-Manual.pdf')],
                                 'competitors': ['wtwco.com/en-sg/solutions/products/stock-throughput',
                                                 'marsh.com/ph/industries/cargo/products/stock-throughput.html',
                                                 'munichre.com/en/insights/mobility-and-transport/stock-throughput-insurance.html',
                                                 'howdengroup.com/sg-en/cover/marine-cargo-insurance (stock throughput section)']},
 'commercial/inland-transit': {'title': 'Inland Transit Insurance Singapore | TRS',
                               'description': "Inland transit insurance in Singapore: all-risks cover for goods on your own lorries or a carrier's, "
                                              'island-wide and into West Malaysia.',
                               'intro': ['Inland transit insurance covers goods while they travel by road or rail within Singapore and, by extension, across '
                                         'the Causeway into West Malaysia. It is bought as an annual policy by distributors, wholesalers, e-commerce '
                                         'fulfilment firms, construction suppliers and manufacturers delivering on their own lorries or through a contracted '
                                         'carrier. The trigger is usually a loss the motor policy refused: commercial vehicle insurance excludes goods '
                                         "carried, and a haulier's trading conditions cap its liability at a few dollars per kilogram.",
                                         'It is not motor insurance, and it does not cover the vehicle, the driver or liability to other road users. The '
                                         'policy is written on all-risks cargo conditions adapted for land transit, with a limit per vehicle or consignment, a '
                                         'deductible per claim and a rate on annual carried value declared at year end. The broker sets the per-vehicle limit '
                                         'to the highest load, adds overnight and depot storage, confirms the territory covers Malaysia, and settles the '
                                         'conditions that apply to theft from an unattended vehicle.'],
                               'who': ['Distributors delivering FMCG, electronics or pharmaceuticals on their own fleet.',
                                       'Last-mile and e-commerce fulfilment operators with high-value parcels per van.',
                                       'Construction and M&E suppliers moving materials to sites across Singapore.',
                                       'Manufacturers trucking finished goods to port or to Johor plants.',
                                       'Businesses using contracted hauliers whose liability is capped by trading conditions.',
                                       'Exhibition and event firms moving equipment between venues.'],
                               'price': [('Maximum value per vehicle',
                                          'The highest load on one lorry sets the limit and most of the rate; splitting high-value loads lowers both.'),
                                         ('Goods carried',
                                          'Electronics, tobacco, liquor and pharmaceuticals rate higher for theft; bulk building materials rate lower.'),
                                         ('Annual carried value', 'Premium is a rate on the value moved in a year, declared and adjusted at expiry.'),
                                         ('Own fleet or third-party carrier',
                                          "Own-fleet cover with vetted drivers rates lower than cover for goods in a subcontracted haulier's hands."),
                                         ('Territory',
                                          'Island-wide Singapore is the base; extension into West Malaysia adds rate and tighter theft conditions.'),
                                         ('Security and loss record',
                                          'GPS tracking, locked bodies, two-driver rules and past theft claims move the deductible and the rate.')],
                               'file': ['Description of goods and the highest value on any one vehicle',
                                        'Annual value of goods moved by road',
                                        'Number of vehicles, LTA class and whether owned or hired',
                                        'Carrier contracts and their liability terms',
                                        'Routes, overnight stops and depot storage practices',
                                        'Security measures and transit loss history'],
                               'pitfalls': [('Expecting the motor policy to pay',
                                             'Commercial vehicle policies exclude goods carried, so a load destroyed in a crash is a cargo loss. Buy inland '
                                             'transit cover and set the limit to the full load, not the average.'),
                                            ('Underinsuring the peak load',
                                             'A S$80,000 limit on a lorry that sometimes carries S$200,000 leaves the difference uninsured. Review the highest '
                                             'consignment each quarter and raise the limit before the season peaks.'),
                                            ('Leaving goods overnight outside cover',
                                             'Theft from an unattended vehicle is commonly excluded unless the vehicle is locked and in a secured yard. Write '
                                             'the overnight procedure into the policy and tell the insurer where vehicles park.')],
                               'faqs': [('Does my commercial vehicle insurance cover the goods on the lorry?',
                                         "No. Singapore commercial vehicle policies cover the vehicle and third-party liability; MSIG's commercial vehicle "
                                         'product, for example, lists goods in transit as excluded. The goods need an inland transit or marine cargo policy. '
                                         'If a contracted carrier is used, its liability is limited by its trading conditions, so the owner of the goods still '
                                         'needs its own cover.'),
                                        ('How much is a Singapore haulier or forwarder liable for?',
                                         'Only what its trading conditions say. The Singapore Aircargo Agents Association standard terms, for example, cap '
                                         "liability at the lower of the goods' value, S$5 per gross kilogram or the agent's charges, with an absolute cap of "
                                         'S$100,000 per claim. Road hauliers use similar clauses. A pallet of electronics worth S$50,000 weighing 200 kg would '
                                         'recover S$1,000 under a S$5 per kilogram cap.'),
                                        ('Is cover extended into Malaysia?',
                                         'Yes, by agreement. Insurers extend inland transit cover to West Malaysia for goods trucked across the Causeway or '
                                         'the Second Link, usually with a higher deductible for theft and a condition on overnight parking. Journeys beyond '
                                         'West Malaysia, or into Thailand, need specific agreement and may be written on marine cargo terms instead.'),
                                        ('What does an all-risks inland transit policy exclude?',
                                         'The standard exclusions follow the Institute Cargo Clauses: wilful misconduct, ordinary wear and tear, loss from '
                                         'insufficient packing by the insured, inherent vice, delay, and nuclear risks. Policies add conditions for unattended '
                                         'vehicles, overnight storage and goods on open-top vehicles. War is excluded; strikes, riots and civil commotion can '
                                         'be added back by endorsement.'),
                                        ('Are goods covered while stored overnight at a depot?',
                                         'Only if the policy says so. Transit cover ends when goods are unloaded into a place of storage, so a depot or '
                                         'cross-dock needs a declared storage extension with its own limit and a maximum number of days. Declare every depot '
                                         'and the value held there, and tell the insurer when a new one opens.'),
                                        ('What vehicle rules affect the fleet carrying the goods?',
                                         'LTA classes goods vehicles by maximum laden weight: light up to 3,500 kg, heavy from 3,501 to 16,000 kg and very '
                                         'heavy above 16,000 kg, with a 20-year lifespan. Goods vehicles above 12,000 kg must have speed limiters set to 60 '
                                         'km/h, and the rule is extending to lorries of 3,501 to 12,000 kg between January 2026 and July 2027. Non-compliance '
                                         'is a Traffic Police offence.')],
                               'sources': [('MSIG Singapore commercial vehicle (goods in transit excluded)',
                                            'https://www.msig.com.sg/commercial/commercial-vehicle'),
                                           ('SAAA standard terms, liability limits',
                                            'https://www.saaa.org.sg/wp-content/uploads/2025/12/Summary_of_SAAA_Standard_Terms_Key_Changes.pdf'),
                                           ('LTA OneMotoring: goods vehicle classes and lifespan',
                                            'https://onemotoring.lta.gov.sg/content/onemotoring/home/buying/vehicle-types-and-registrations/commercial-vehicle/goods-vehicle-and-engineering-plant.html'),
                                           ('Singapore Police Force: speed limiter regime',
                                            'https://www.police.gov.sg/Knowledge-Hub/Traffic/Traffic-Matters/Speed-Limiter-Announcement')],
                               'competitors': ['msig.com.sg/node/689 (marine cargo, inland transit annual policy)',
                                               'chubb.com/sg-en/business/cargo-liability-insurance.html',
                                               'marsh.com/sg/services/small-business-insurance/products/cargosecure.html',
                                               'sc.com/sg/business-insurance/business-protection-insurance/marine-cargo-insurance']},
 'commercial/motor': {'title': 'Commercial Vehicle & Fleet Insurance Singapore | TRS',
                      'description': 'Commercial vehicle and fleet insurance in Singapore: comprehensive, TPFT or third-party only for vans, lorries and prime '
                                     'movers, with fleet rating.',
                      'intro': ['Commercial vehicle insurance covers vans, lorries, pick-ups, prime movers and company cars used for business, and the '
                                'liability the business carries for how they are driven. Singapore law makes third-party cover compulsory under the Motor '
                                'Vehicles (Third-Party Risks and Compensation) Act: a vehicle cannot be registered with LTA or used on the road without it. '
                                'Logistics firms, contractors, distributors and service companies move to a fleet policy once they run several vehicles, '
                                'because one policy, one renewal date and fleet rating replace a stack of single-vehicle covers.',
                                'It is not cover for the goods carried, which need inland transit insurance, nor for vehicles used for hire and reward such as '
                                'ride-hailing, which insurers exclude. Cover is bought as comprehensive, third-party fire and theft, or third-party only, with '
                                'unlimited third-party bodily injury, a property damage limit, and excesses that rise for young or inexperienced drivers. The '
                                'broker rates the fleet on its claims record, sets driver and excess terms that fit the roster, and handles claims and '
                                'recoveries.'],
                      'who': ['Logistics and last-mile operators running 10 or more vans and lorries.',
                              'Construction and M&E contractors with lorries, tippers and crane trucks above 3,500 kg.',
                              'Distributors and FMCG firms with refrigerated vans and delivery trucks.',
                              'Companies with pooled cars and vans driven by any employee.',
                              'Courier firms with motorcycle fleets that a personal policy will not cover.',
                              'Leasing and rental operators needing cover on vehicles they own, lease or rent out.'],
                      'price': [('Fleet size and claims record',
                                 'Fleets of 10 or more vehicles are rated on their own loss history; MSIG, for example, offers a 20% discount at that size, '
                                 'and a claim-free year earns a refund with some insurers.'),
                                ('Vehicle class and weight',
                                 'Prime movers and lorries above 16,000 kg carry higher third-party exposure and rate above light goods vehicles under 3,500 '
                                 'kg.'),
                                ('Driver profile',
                                 'Insurers add an excess for drivers under a stated age or with less than two years on a licence; a named-driver fleet can '
                                 'price lower than any-driver cover.'),
                                ('Cover level',
                                 'Comprehensive costs most; third-party only is available for older vehicles, with MSIG writing it beyond 25 years of age '
                                 'subject to underwriting.'),
                                ('Vehicle age and value',
                                 'Own-damage premium follows market value including COE; a vehicle near its 20-year statutory lifespan is usually insured '
                                 'third-party only.'),
                                ('Territory and use',
                                 'Regular trips into West Malaysia, carriage of hazardous goods or hire-and-reward use change the rate or make the vehicle '
                                 'unplaceable.')],
                      'file': ['Vehicle list with registration, make, laden weight, year and value',
                               'Claims experience from current insurers, usually three years',
                               'Driver list with ages and licence dates, or any-driver confirmation',
                               'Use of each vehicle: goods carried, routes, Malaysia trips',
                               'Existing policy schedules, NCD entitlements and excess levels',
                               'Telematics, dashcams or driver training in place'],
                      'pitfalls': [('Using a personal policy for business use',
                                    'A private car or motorcycle policy does not cover commercial use, and the General Insurance Association warns the insurer '
                                    'can repudiate the claim and cancel the policy. Insure every vehicle used for work on a commercial policy, including staff '
                                    'motorcycles used for deliveries.'),
                                   ('Ignoring the young-driver excess',
                                    "Policies add a large excess when the driver is under the stated age or has held a licence under two years; Etiqa's is "
                                    'S$4,000 for drivers under 27 or over 75. Match the roster to the policy and negotiate the excess before a new hire '
                                    'drives.'),
                                   ('Assuming property damage is unlimited',
                                    'Only third-party bodily injury is unlimited; property damage is capped, at S$500,000 on several Singapore commercial '
                                    'vehicle products. A heavy vehicle hitting a bus stop, gantry or shop front can exceed that, so raise the limit for '
                                    'lorries and prime movers.')],
                      'faqs': [('What is the minimum insurance a commercial vehicle needs in Singapore?',
                                'Third-party cover for death or bodily injury, required under the Motor Vehicles (Third-Party Risks and Compensation) Act '
                                'before LTA registers the vehicle or it is used on the road. Third-party only policies meet the minimum; they do not pay for '
                                'damage to the insured vehicle. Most fleets buy comprehensive on newer vehicles and third-party only on vehicles near the end '
                                'of their 20-year lifespan.'),
                               ('What is the difference between comprehensive, TPFT and third-party only?',
                                'All three cover unlimited third-party bodily injury and third-party property damage up to the policy limit. Third-party only '
                                'stops there. Third-party fire and theft adds loss of the insured vehicle by fire or theft. Comprehensive adds accidental '
                                'damage to the vehicle, windscreen, towing and usually flood. Excesses and young-driver loadings apply only to the own-damage '
                                'sections.'),
                               ('How does fleet rating work?',
                                'From about 10 vehicles the insurer prices the fleet on its own claims record rather than the standard tariff, and the policy '
                                'covers vehicles added and removed during the year on declaration. MSIG offers a 20% discount for fleets of 10 or more, and '
                                'some insurers refund part of the premium after a claim-free year. No-claim discount on individual vehicles is replaced by the '
                                'fleet experience rating.'),
                               ('Are my vehicles covered in Malaysia?',
                                'Commercial vehicle policies in Singapore cover use in West Malaysia, and several extend to Thailand within 80 km of the '
                                'Malaysian border. Conditions differ: Etiqa applies an extra S$2,000 excess if the vehicle is stolen outside Singapore. Check '
                                'the policy schedule before sending lorries across the Causeway, and confirm the goods in transit policy extends the same '
                                'way.'),
                               ('Which LTA rules change the premium or the terms?',
                                'LTA classes goods vehicles by maximum laden weight: light up to 3,500 kg, heavy 3,501 to 16,000 kg, very heavy above 16,000 '
                                'kg. Goods vehicles have a 20-year statutory lifespan. Vehicles above 12,000 kg need speed limiters set at 60 km/h, extending '
                                'to lorries of 3,501 to 12,000 kg between January 2026 and July 2027, and vehicles up to 3,500 kg need a speed warning device. '
                                'Insurers rate by class and ask about compliance.'),
                               ('What excess will the business pay on a claim?',
                                'A standard own-damage excess per claim, a windscreen excess of S$100 on most products, and an additional excess for young or '
                                'inexperienced drivers: S$4,000 at Etiqa for drivers under 27, over 75 or licensed under two years; Singlife applies it to '
                                'drivers aged 24 and below or licensed under two years. Third-party claims carry no excess. MSIG writes its fleet cover with '
                                'no additional driver excess.')],
                      'sources': [('Motor Vehicles (Third-Party Risks and Compensation) Act 1960', 'https://sso.agc.gov.sg/Act/MVTPRCA1960'),
                                  ('LTA OneMotoring: goods vehicle classes and lifespan',
                                   'https://onemotoring.lta.gov.sg/content/onemotoring/home/buying/vehicle-types-and-registrations/commercial-vehicle/goods-vehicle-and-engineering-plant.html'),
                                  ('Singapore Police Force: speed limiter regime',
                                   'https://www.police.gov.sg/Knowledge-Hub/Traffic/Traffic-Matters/Speed-Limiter-Announcement'),
                                  ('Etiqa commercial vehicle insurance (limits and excesses)',
                                   'https://www.etiqa.com.sg/business-insurance/commercial-vehicle')],
                      'competitors': ['msig.com.sg/node/690 (commercial vehicle)',
                                      'etiqa.com.sg/business-insurance/commercial-vehicle',
                                      'libertyinternational.com/sg/commercial-vehicle',
                                      'aig.sg/business/business-products-and-services/commercial-motor',
                                      'sc.com/sg/business-insurance/business-protection-insurance/commercial-vehicle-insurance',
                                      'singlife.com Commercial_Vehicle_Insurance_Summary_of_Cover.pdf',
                                      'gia.org.sg motor insurance FAQ (commercial use of personal vehicles)']},
 'commercial/surety-bonds': {'title': 'Surety Bonds & Performance Bonds Singapore | TRS',
                             'description': 'Surety bonds Singapore: insurer-issued performance, tender, advance payment, foreign worker and customs bonds in '
                                            'place of bank guarantees or cash deposits.',
                             'intro': ['A surety bond is a guarantee issued by an insurer to a project owner, government agency or customs authority that a '
                                       'business will meet an obligation: finish the works, honour a tender, use an advance correctly, or pay duty. Singapore '
                                       'contractors, subcontractors, M&E firms, facility managers and traders buy bonds because the contract or the law '
                                       'demands security: PSSCOC public-sector contracts call for a deposit or a bank or insurer guarantee, MOM requires a '
                                       'S$5,000 security bond for each non-Malaysian Work Permit holder, and Singapore Customs accepts an insurance bond for '
                                       'suspended duty.',
                                       'A bond is not insurance for the contractor. If the beneficiary calls it, the insurer pays and then recovers from the '
                                       'contractor under a counter-indemnity signed at the outset. Bonds are issued one at a time or under an annual facility '
                                       'with an aggregate limit, at a rate on the bond amount for its term, with performance bonds usually at 5% to 10% of the '
                                       'contract sum. The broker arranges the facility, negotiates the bond wording with the beneficiary, and manages calls '
                                       'and releases.'],
                             'who': ['Main contractors and subcontractors on PSSCOC and private construction contracts.',
                                     'M&E, facade and fit-out specialists asked for performance and retention bonds.',
                                     'Facility management and services firms on multi-year government contracts.',
                                     'Employers of Work Permit holders needing MOM security bonds.',
                                     'Importers, licensed warehouse operators and excise traders lodging security with Customs.',
                                     'Companies whose bank guarantee lines are fully used or secured by cash.'],
                             'price': [('Financial strength',
                                        'Audited accounts, net worth and gearing set the facility limit and the rate; a weak balance sheet means collateral or '
                                        'no facility.'),
                                       ('Bond type and wording',
                                        'On-demand bonds, payable on written demand, rate higher than conditional bonds that need proof of breach and loss.'),
                                       ('Bond amount and term',
                                        'The rate applies to the bond value for its full term including any defects liability period; a 10% bond on a S$20 '
                                        'million contract runs on S$2 million.'),
                                       ('Contract and beneficiary',
                                        'Government and statutory board contracts on standard wordings place more readily than bespoke private wordings with '
                                        'wide call rights.'),
                                       ('Track record', 'Completed projects of similar size, no past bond calls and no live disputes lower the rate.'),
                                       ('Security offered',
                                        'Personal guarantees from directors, cash collateral or a charge lower the rate and lift the facility limit.')],
                             'file': ['Audited accounts for recent years and current management accounts',
                                      'Contract, tender conditions and the bond wording demanded',
                                      'Work-in-hand schedule with contract values and completion dates',
                                      'Record of bonds issued, outstanding and ever called',
                                      "Directors' and shareholders' details for the counter-indemnity",
                                      'Bank facility letters showing existing guarantee lines'],
                             'pitfalls': [('Signing an on-demand wording unread',
                                           "An on-demand bond pays on the beneficiary's written demand without proof of breach, and Singapore courts stop a "
                                           'call only for fraud or unconscionability. Negotiate a conditional wording where the contract allows, as the PSSCOC '
                                           'form does, and have the broker check every call right before issue.'),
                                          ('Treating the bond as insurance',
                                           'The insurer recovers every dollar paid on a call from the contractor under the counter-indemnity, often backed by '
                                           "directors' personal guarantees. Model a call as a cash event and keep the facility within what the balance sheet "
                                           'can repay.'),
                                          ('Letting the bond expire or over-run',
                                           'A bond that expires before the defects period ends breaches the contract; one left open after completion ties up '
                                           'the facility. Diarise expiry and release dates and ask the beneficiary for a discharge letter in writing.')],
                             'faqs': [('What is the difference between a surety bond and a bank guarantee?',
                                       'Both are accepted by Singapore government agencies, which ask for a bond from a bank or insurance company registered '
                                       "with MAS. A bank guarantee uses the company's credit line and is often secured by cash. A surety bond is issued by an "
                                       'insurer against a counter-indemnity, so it leaves bank lines and working capital free. Allianz Trade describes bonding '
                                       'as releasing bank working capital facilities and reducing security requirements.'),
                                      ('How much is a performance bond in Singapore?',
                                       'Typically 5% to 10% of the contract sum, as Tokio Marine Singapore states for its performance bond. PSSCOC 2020 clause '
                                       '4.5 requires a security deposit of the amount in the contract appendix, or a bank or insurer guarantee in lieu; in SH '
                                       'Design & Build v Jurong Port [2026] SGHC 159 the figure was 10%. The bond usually runs to the end of the defects '
                                       'liability period.'),
                                      ('What is the difference between an on-demand and a conditional bond?',
                                       "An on-demand bond pays on the beneficiary's written demand; the insurer does not ask whether the contractor is in "
                                       'breach. A conditional bond pays only on proof of breach and loss. In AXA Insurance v Chiu Teng Construction [2021] '
                                       'SGCA 62 the Court of Appeal dealt with a conditional bond issued by an insurer and held a court judgment or admission '
                                       'was not needed before a valid call. The wording decides which type you hold.'),
                                      ('Can an insurer issue the MOM security bond for foreign workers?',
                                       'Yes. MOM requires a S$5,000 security bond for each non-Malaysian Work Permit holder, bought from any bank or insurance '
                                       'company before the worker arrives; the worker cannot be asked to pay for it. The bond is forfeited if the employer or '
                                       'worker breaches Work Permit conditions, and discharged about one week after the worker leaves Singapore if the permit '
                                       'is cancelled and no breach occurred.'),
                                      ('Does Singapore Customs accept an insurance bond?',
                                       "Yes. Customs accepts a Banker's Guarantee, a Finance Company Guarantee or an Insurance Bond, lodged electronically "
                                       'through eGuarantee@Gov since 1 October 2023 with a minimum validity of 15 months. The amount depends on the movement: '
                                       '50% of potential duty for liquor and tobacco entering a licensed warehouse, for example. No security is needed when '
                                       'the amount would be S$2,000 or less.'),
                                      ('What happens when a bond is called?',
                                       "The beneficiary serves a written demand within the bond's terms. The insurer pays within the period the bond states, "
                                       'then claims the amount from the contractor under the counter-indemnity. The contractor can apply to court to restrain '
                                       "the call, but Singapore courts grant that only for fraud or unconscionability, or where the demand fails the bond's "
                                       "own conditions, as in SH Design & Build v Jurong Port, where an invalid superintending officer's decision defeated the "
                                       'call.')],
                             'sources': [('MOM: security bond for Work Permit holders',
                                          'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/security-bond'),
                                         ('Singapore Customs: how to lodge security',
                                          'https://www.customs.gov.sg/doing-business/getting-started/security-lodgement/how-to-lodge-security/'),
                                         ('BCA: Public Sector Standard Conditions of Contract',
                                          'https://www1.bca.gov.sg/growth-and-transformation/procurement/standard-contract-forms/public-sector-standard-conditions-of-contract-psscoc/'),
                                         ('SH Design & Build v Jurong Port [2026] SGHC 159', 'https://www.elitigation.sg/gd/s/2026_SGHC_159')],
                             'competitors': ['tokiomarine.com/sg/en/non-life/products/business/bonds-guarantees/performance-bond.html',
                                             'allianz-trade.com/en_SG/resources/non-customer/surety-and-guarantees.html',
                                             'elitigation.sg/gd/s/2021_SGCA_62 (AXA v Chiu Teng)',
                                             'customs.gov.sg security lodgement pages']},
 'commercial/core-liability': {'title': 'Public Liability Insurance Singapore | TRS',
                               'description': 'Public liability insurance in Singapore: third-party injury and property damage, products liability, lease and '
                                              'tender limits and defence costs.',
                               'intro': ['Public and products liability insurance pays the compensation and defence costs a business owes when a third party '
                                         'is injured or their property is damaged because of its operations or products. In Singapore the purchase is usually '
                                         'forced by a contract. Landlords ask for it in the lease before handing over keys. Main contractors and government '
                                         'tenders ask for it before a sub-contractor starts on site. Retailers, F&B operators, event companies, contractors, '
                                         'logistics firms and manufacturers buy it for this reason.',
                                         "It is not cover for the insured's own staff. Work injuries are compensated under the Work Injury Compensation Act, "
                                         'which needs its own policy. Public liability is written on an occurrence basis: the policy in force when the injury '
                                         'or damage happens responds, however late the claim arrives. The buyer chooses a limit per occurrence and in '
                                         'aggregate, a deductible, a territory and a jurisdiction. The broker reads the lease or tender clause, matches the '
                                         "limit and the principal's name to it, and places the policy with the insurer whose wording fits the trade."],
                               'who': ['Tenants of retail, office or industrial units whose lease requires public liability cover naming the landlord.',
                                       'Contractors and sub-contractors who must show a policy before a tender award or site access.',
                                       'Manufacturers, importers and distributors whose products reach consumers in Singapore or overseas.',
                                       'F&B, event and hospitality operators with public footfall on their premises.',
                                       'Logistics, cleaning, facility and security firms working on client sites.',
                                       'Clinics, schools and enrichment centres with visitors and children on the premises.'],
                               'price': [('Trade',
                                          'A hot-works contractor or a crowd event carries more injury risk than an office tenant and pays a higher rate on '
                                          'the same limit.'),
                                         ('Limit of indemnity',
                                          'The per-occurrence and aggregate limits drive the premium; insurers price the figure in the lease or tender '
                                          'clause.'),
                                         ('Turnover and payroll',
                                          'Insurers rate on annual turnover or wages, so a new contract or site changes the premium at renewal.'),
                                         ('Products and markets',
                                          'Goods sold into the USA or Canada are priced separately or excluded; territory and jurisdiction follow the sales '
                                          'map.'),
                                         ('Claims history',
                                          'Five years of claims experience sets the rate and the deductible; a clean record earns a lower excess.'),
                                         ('Deductible', 'A higher excess per claim lowers the premium and keeps small property-damage claims off the record.')],
                               'file': ['Description of activities, premises and any work at height or hot works',
                                        "Last three years' turnover and the current year's estimate",
                                        'Lease or contract clause stating the required limit and principal',
                                        'Claims and incident history for the last five years',
                                        'Product list, markets sold into and any recalls',
                                        'Sub-contractor use and their own insurance certificates'],
                               'pitfalls': [('Limit set below the contract',
                                             'The lease or tender states a limit per occurrence and the policy carries a lower one, so the certificate is '
                                             'rejected or the shortfall is uninsured. Read the clause before placement and match the limit, the principal name '
                                             'and the cross-liability wording.'),
                                            ('Staff injuries claimed under the wrong policy',
                                             'A worker is hurt on site and the claim goes to the public liability insurer, which declines it because employees '
                                             'are excluded. Work injuries belong under a Work Injury Compensation policy, which is compulsory for every manual '
                                             'worker and every non-manual employee earning S$2,600 a month or less.'),
                                            ('Territory stops at the border',
                                             'A product reaches a customer overseas or a crew works in Johor and the policy covers Singapore only. Set '
                                             'territory and jurisdiction to match where the goods and the people go, and declare any North American sales.')],
                               'faqs': [('Is public liability insurance compulsory in Singapore?',
                                         'No law makes it compulsory. Work Injury Compensation insurance is compulsory for employees; public liability is not. '
                                         "Most purchases are driven by a contract: a lease, a tender, a mall operator's fit-out rules or a client's vendor "
                                         'terms. If a lease or tender states a minimum limit, the business must hold it before the keys or the site are handed '
                                         'over.'),
                                        ('What is the difference between public liability and products liability?',
                                         "Public liability covers injury or damage caused by the business's operations and premises. Products liability covers "
                                         "injury or damage caused by goods after they have left the business's control, including goods it imports or "
                                         'distributes under its own name. Both are usually written in one policy with one combined limit. A manufacturer or '
                                         'importer needs the products section; a pure service firm may not.'),
                                        ('Does it cover injuries to my own employees?',
                                         'No. Employees are excluded. Their injuries fall under the Work Injury Compensation Act, which for accidents from 1 '
                                         'November 2025 caps compensation at S$269,000 for death, S$346,000 for permanent incapacity and S$53,000 for medical '
                                         'expenses. Employers must insure all manual workers and non-manual employees earning S$2,600 a month or less under a '
                                         'separate policy, or face a fine of up to S$10,000, jail of up to 12 months, or both.'),
                                        ('What limit do landlords and tenders ask for?',
                                         'The figure is set in the lease or the tender conditions, not by law. It is usually stated per occurrence, with the '
                                         'landlord or principal named as an additional insured and a cross-liability clause. Read the clause before buying. If '
                                         'the policy limit is lower than the clause, the certificate is rejected at handover or award and the gap is '
                                         'uninsured.'),
                                        ('Is public liability written on a claims-made or occurrence basis?',
                                         'Occurrence. The policy in force on the date the injury or damage happened pays, even if the claim is lodged years '
                                         'later. That differs from professional indemnity, which is claims-made and responds only if a policy is live when the '
                                         "claim arrives. Keep expired policy schedules on file, because a claim for an old incident goes back to that year's "
                                         'insurer.'),
                                        ('Does the policy pay legal costs?',
                                         "Yes. Defence costs incurred with the insurer's consent are covered, including a Singapore court action. Whether "
                                         'those costs sit inside the limit or on top of it depends on the wording. With costs inside the limit, a long defence '
                                         'leaves less for the award itself. Ask for costs in addition to the limit where the contract limit is tight.')],
                               'sources': [('MOM: Work injury compensation insurance',
                                            'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                                           ('MOM: Higher WICA compensation limits from 1 Nov 2025',
                                            'https://www.mom.gov.sg/newsroom/press-releases/2024/0802-higher-compensation-limits-under-the-work-injury-compensation-act'),
                                           ('MOM: S$2,600 salary threshold for non-manual employees',
                                            'https://www.mom.gov.sg/faq/work-injury-compensation/why-is-the-salary-threshold-compulsory-wic-insurance-coverage-for-nonmanual-employees-increased-2600')],
                               'competitors': ['sleek.com/sg/resources/public-liability-insurance-singapore/',
                                               'osome.com/sg/blog/what-is-public-liability-insurance-singapore/',
                                               'sc.com/sg/business-insurance/business-protection-insurance/public-liability-insurance/']},
 'commercial/professional': {'title': 'Professional Indemnity Insurance Singapore | TRS',
                             'description': 'Professional indemnity insurance in Singapore: claims-made cover for negligent advice, design and service, '
                                            'retroactive dates, limits and run-off.',
                             'intro': ['Professional indemnity insurance pays the compensation and defence costs a firm owes when a client says its advice, '
                                       'design or service was negligent and caused financial loss. In Singapore it is bought by engineers, architects, '
                                       'consultants, accountants, IT and software firms, marketing agencies and fund managers. The trigger is usually a '
                                       "contract: a client's procurement terms or a tender demand a stated limit for the life of the engagement. Some "
                                       "professions must hold it to practise; advocates and solicitors are covered through the Law Society's compulsory "
                                       'scheme.',
                                       'It is not cover for injury or property damage, which sits under public liability. It is written on a claims-made '
                                       'basis: the policy answers only to claims first made and notified while it is in force. A retroactive date sets how far '
                                       'back the covered work goes. The buyer selects a limit per claim and in aggregate, a deductible and an annual term. The '
                                       "broker checks the retroactive date and the client's clause before placing the policy, and arranges run-off cover when "
                                       'the firm closes or changes insurer.'],
                             'who': ['Engineering, architectural and project management practices with design responsibility.',
                                     'Management, HR, ESG and strategy consultants engaged under client procurement terms.',
                                     'IT, software and SaaS firms whose contracts include errors and omissions clauses.',
                                     'Accounting, tax and corporate secretarial firms acting for many clients at once.',
                                     'Marketing, PR and media agencies exposed to defamation and IP claims.',
                                     'Fund managers and financial advisers whose MAS licence carries a cover condition.'],
                             'price': [('Profession',
                                        'Structural engineers and fund managers sit in higher rating bands than HR consultants because claims are larger and '
                                        'more frequent.'),
                                       ('Fee income', 'Insurers rate on annual fees, so a new large contract moves the premium at renewal.'),
                                       ('Limit and deductible',
                                        'The limit demanded by the client contract and the excess the firm accepts set most of the premium.'),
                                       ('Retroactive date',
                                        'Full retroactive cover back to incorporation costs more than cover from inception, because the insurer takes on past '
                                        'work.'),
                                       ('Contract terms',
                                        'Unlimited liability, liquidated damages and fitness-for-purpose clauses in client contracts are underwritten and can '
                                        'be excluded.'),
                                       ('Claims history', 'Claims or notified circumstances in the last five years raise the rate or the deductible.')],
                             'file': ['Fee income for the last three years, split by service line',
                                      'Largest five contracts by value and their liability clauses',
                                      'Current policy schedule with retroactive date and limit',
                                      'Claims and notified circumstances for the last five years',
                                      'Standard terms of engagement and professional qualifications',
                                      'Sub-consultant use and whether their work is reviewed'],
                             'pitfalls': [('Retroactive date lost on switching insurer',
                                           'A firm moves to a cheaper insurer and the new policy starts cover from inception, so claims on earlier work fall '
                                           'into a gap. Require the new policy to carry the old retroactive date before cancelling, and get it printed on the '
                                           'schedule.'),
                                          ('Circumstance not notified in time',
                                           'A client complains in writing, the firm waits to see if it goes away, and the claim arrives after renewal under a '
                                           'new insurer who excludes it as a known circumstance. Notify every written complaint or likely claim to the insurer '
                                           'in the policy year it surfaces.'),
                                          ('Policy lapses when the firm closes',
                                           'The practice winds up, the policy is cancelled, and a claim arrives two years later with no insurer to answer. Buy '
                                           'run-off cover for the period claims can still be brought; for financial loss the Limitation Act allows six years '
                                           'from the cause of action, or three years from discovery, up to a 15-year longstop.')],
                             'faqs': [('What does claims-made mean?',
                                       'The policy responds to claims first made against the firm and reported to the insurer during the policy period, not to '
                                       'when the work was done. Work done in 2021 and challenged in 2026 is claimed on the 2026 policy, provided the '
                                       'retroactive date reaches back to 2021. If the policy has lapsed when the claim arrives, there is no cover. Continuous '
                                       'renewal and prompt notification keep the cover intact.'),
                                      ('What is a retroactive date?',
                                       'The earliest date of work the policy will cover. Claims arising from work done before it are excluded. A first-time '
                                       'buyer usually gets a retroactive date equal to inception; a firm with continuous cover keeps its original date at each '
                                       'renewal. When switching insurers, the new policy should carry the same date. The broker checks the schedule for this '
                                       'before the old policy is cancelled.'),
                                      ('Which professions must hold it in Singapore?',
                                       "Advocates and solicitors are covered by the Law Society's compulsory professional indemnity scheme. Retail licensed "
                                       'fund management companies must hold minimum professional indemnity insurance set by MAS, starting at S$2 million for '
                                       "firms managing under S$100 million. Other professions are driven by contract or by a professional body's membership "
                                       "rules rather than statute, so the client's clause is the practical minimum."),
                                      ('How much cover do I need?',
                                       'Start from the highest limit any current contract demands, then test it against the largest project and the loss a '
                                       'client could claim on it. A design error on a large build can cost many times the fee. Check whether defence costs sit '
                                       'inside or outside the limit; costs inside the limit reduce what is left for the award. Aggregate limits should allow '
                                       'for more than one claim in a year.'),
                                      ('Does it cover claims from overseas clients?',
                                       'Only if the territory and jurisdiction clauses allow it. Many Singapore policies cover work done worldwide but exclude '
                                       'claims brought in USA or Canada courts, or price them separately. A firm with clients in those markets should declare '
                                       'them and ask for the exclusion to be lifted. Contracts governed by foreign law should be listed on the proposal form.'),
                                      ('What happens when I retire or close the firm?',
                                       'Claims can still be made after the firm stops trading. Under section 24A of the Limitation Act, an action for '
                                       'negligence causing financial loss can be brought up to six years from when the cause of action accrued, or three years '
                                       'from when the claimant first had the knowledge needed to sue, with an overriding limit of 15 years under section 24B. '
                                       'Run-off cover keeps a claims-made policy answering through that period.')],
                             'sources': [('MAS: Guidelines on Licensing and Conduct of Business for FMCs, Appendix 3 PII',
                                          'https://www.mas.gov.sg/-/media/mas-media-library/regulation/guidelines/cmg/guideline-sfa-04-g05-on-licensing-registration-and-conduct-of-business-for-fund-managers/sfa--guidelines-on-licensing-and-conduct-of-business-for-fmcs-10-dec-2024.pdf'),
                                         ('Limitation Act 1959, sections 24A and 24B', 'https://sso.agc.gov.sg/Act/LA1959'),
                                         ('Law Society of Singapore PI scheme (administered by Marsh)', 'https://asia.marsh.com/lss-pi/sg/home.html')],
                             'competitors': ['chubb.com/sg-en/articles/business/the-evolving-landscape-of-professional-indemnity-in-singapore.html',
                                             'howdengroup.com/sg-en/clp/professional-indemnity-insurance',
                                             'sleek.com/sg/resources/professional-indemnity-insurance-singapore/']},
 'commercial/dao': {'title': 'Directors and Officers Insurance Singapore | TRS',
                    'description': 'Directors and officers insurance in Singapore: Side A, B and C, Companies Act limits on indemnity, investigation costs and '
                                   'insolvency claims.',
                    'intro': ['Directors and officers insurance pays the defence costs, investigation costs and damages that directors, officers and senior '
                              'managers face personally when they are sued or investigated over decisions made in running the company. Singapore buyers '
                              'include private companies with outside investors, subsidiaries of foreign groups, SGX-listed companies and firms licensed by '
                              "MAS or MOH. The purchase is usually triggered by a funding round, a board appointment, a listing or a regulator's enquiry. "
                              'Investors and independent directors often make it a condition of joining.',
                              "It is not cover for the company's trade debts, nor for fraud once proven. Under section 172 of the Companies Act, any provision "
                              'exempting or indemnifying an officer against liability for negligence, default, breach of duty or breach of trust to the '
                              'company is void; section 172A lets the company buy insurance instead. The policy is claims-made with one annual aggregate limit '
                              'shared across Side A (the individual), Side B (company reimbursement) and Side C (the entity, usually for securities claims). '
                              'The broker sets the limit, the retentions and the extensions.'],
                    'who': ['Companies raising venture or private equity funding where investors require cover before closing.',
                            'Boards appointing independent or non-executive directors who ask for protection.',
                            "Singapore subsidiaries of foreign groups whose local directors are not on the parent's policy.",
                            'Fintech, payments and healthcare firms licensed by MAS or MOH and open to regulatory investigation.',
                            'Employers exposed to wrongful dismissal, discrimination and harassment claims.',
                            'Companies near insolvency where a liquidator may pursue former directors.'],
                    'price': [('Balance sheet',
                               'Insurers read net assets, cash runway and debt; a weak balance sheet raises the chance of insolvency claims and the premium.'),
                              ('Listing and investors',
                               'An SGX listing or a US-listed parent adds securities-claim exposure; private companies with no outside shareholders pay less.'),
                              ('Sector and regulator',
                               'MAS-licensed, MOH-licensed and digital asset businesses carry investigation exposure that is rated higher.'),
                              ('Limit structure', 'The limit chosen, and whether Side A is ring-fenced or shared with the entity, sets most of the premium.'),
                              ('Open matters',
                               'Current litigation, regulatory notices or shareholder disputes are excluded from the new policy and priced into the rest.'),
                              ('US exposure',
                               'Employees, subsidiaries or listings in the USA bring US litigation costs, which are priced separately or excluded.')],
                    'file': ['Latest audited accounts and current management accounts',
                             'Shareholder list and any venture or private equity terms',
                             'Board and senior management list with appointment dates',
                             'Any litigation, regulatory enquiry or shareholder dispute, open or threatened',
                             'Group structure including overseas subsidiaries',
                             'Employee headcount and any dismissal or harassment complaints'],
                    'pitfalls': [('Side A shared away',
                                  'The company reimbursement and entity sections exhaust the limit on a securities or employment claim, leaving the directors '
                                  'with nothing when the company cannot indemnify them. Buy a dedicated Side A excess limit or a reinstatement clause so the '
                                  'individuals keep a limit of their own.'),
                                 ('Insolvency arrives after the policy lapses',
                                  'The company stops paying premiums as cash runs out, and the liquidator sues former directors months later with no policy in '
                                  'force. Keep the policy running and buy a run-off period before winding up; the insolvent company is the one most likely to '
                                  'produce a claim.'),
                                 ('Known circumstances not declared',
                                  "A regulator's letter or a shareholder's threat is left off the proposal form, the policy is placed, and the claim is "
                                  'declined for non-disclosure. Declare every open matter in writing; the insurer excludes it, and the rest of the cover '
                                  'stands.')],
                    'faqs': [('What do Side A, Side B and Side C mean?',
                              'Side A pays the director or officer directly when the company cannot or will not indemnify them, for example in insolvency or '
                              'where the Companies Act forbids the indemnity. Side B reimburses the company when it has lawfully indemnified a director. Side '
                              'C covers the company itself, usually only for securities claims. All three share one aggregate limit unless a separate Side A '
                              'limit is bought.'),
                             ('Can the company not just indemnify its directors?',
                              'Only in part. Section 172 of the Companies Act makes void any provision that exempts or indemnifies an officer against '
                              'liability for negligence, default, breach of duty or breach of trust in relation to the company. Section 172A allows the '
                              'company to buy and maintain insurance against that liability, and section 172B permits a narrower third-party indemnity. The '
                              'policy fills the gap the Act leaves.'),
                             ('Does it cover regulatory investigations by MAS or ACRA?',
                              'Most policies pay legal representation costs when a director is required to attend, or is named in, a formal investigation by a '
                              'regulator, and some extend to internal inquiries that precede a self-report. Civil fines and penalties may be covered where the '
                              'law allows; criminal fines are not. Read the investigation extension and its sub-limit before placement.'),
                             ('Are former directors covered?',
                              'Yes, where the policy defines insured persons to include past, present and future directors and officers, which most do. The '
                              'claim must be made while a policy is in force, so a director who has left still depends on the company renewing. A departing '
                              'director can ask for a run-off period or a contractual promise to maintain cover for a set number of years.'),
                             ('Does it cover claims by the company against its own directors?',
                              'Usually not. The insured-versus-insured exclusion removes claims brought by the company or on its behalf, with carve-backs for '
                              'liquidators, whistleblowers and shareholder derivative actions. The liquidator carve-back matters: in 2024 the High Court held '
                              'a former director of Inter-Pacific Petroleum liable for US$146 million plus interest for breach of duty. Check the carve-back '
                              'wording.'),
                             ('What does employment practices liability add?',
                              'Cover for claims by employees or former employees alleging wrongful dismissal, discrimination, harassment or retaliation, '
                              'against both the individuals and the company. It is bought as an extension or a separate policy with its own sub-limit and '
                              'retention. In Singapore, salary and dismissal disputes first go to the Tripartite Alliance for Dispute Management and the '
                              'Employment Claims Tribunals; larger claims go to court.')],
                    'sources': [('Companies Act 1967, sections 172 to 172B', 'https://sso.agc.gov.sg/Act/CoA1967?ProvIds=P1IV-P2_4-'),
                                ('ACRA: key changes to the Companies Act affecting directors and CEOs',
                                 'https://www.acra.gov.sg/legislation/legislative-reform/companies-act-reform/companies-amendment-act-2014/key-amendments-to-the-companies-act/key-changes-to-companies-act-impacting-directors-and-ceos')],
                    'competitors': ['osome.com/sg/blog/a-guide-to-d-o-insurance-directors-and-officers-in-singapore/',
                                    'dbs.com.sg/sme/directors-and-officers-insurance/elite-vi-directors-officers-liability-factsheet-sg.pdf',
                                    'howdengroup.com/sg-en/former-director-insolvent-company-held-liable-146m']},
 'commercial/imi': {'title': 'Investment Management Insurance Singapore | TRS',
                    'description': 'Investment management insurance in Singapore: PI, D&O and crime in one policy for MAS-licensed fund managers, with the PII '
                                   'minimums explained.',
                    'intro': ['Investment management insurance combines professional indemnity, directors and officers liability and crime cover in one policy '
                              'for fund managers, their funds and their directors. In Singapore the buyers are licensed fund management companies, venture '
                              'capital fund managers, family offices and external asset managers. The trigger is the MAS licence: Retail LFMCs must hold '
                              'minimum professional indemnity insurance scaled to assets under management, and institutional investors ask every manager for a '
                              'certificate during operational due diligence.',
                              "It is not cover for investment losses caused by market movements, nor for a fund's own trading losses. Each section has its own "
                              'trigger: PI is claims-made for breach of professional duty, D&O is claims-made for management wrongful acts, and crime is '
                              'discovery-based for theft by staff or outsiders. The buyer sets a limit per section or one shared aggregate, a deductible, and '
                              'an annual term; for a Retail LFMC the deductible is capped at 20% of base capital. The broker matches the wording to the MAS '
                              'minimum and the fund documents.'],
                    'who': ['Retail licensed fund management companies with a MAS minimum PII to evidence.',
                            'A/I licensed fund managers and VCFMs meeting institutional investor due diligence.',
                            'Single and multi-family offices managing third-party or related-party money.',
                            'External asset managers and robo-advisers holding client mandates.',
                            'General partners and fund directors who need D&O on the fund vehicles.',
                            'REIT and private credit managers with trustee-imposed cover requirements.'],
                    'price': [('Assets under management',
                               'AUM sets both the MAS minimum and the rating base; the Retail LFMC minimum rises from S$2 million below S$100 million AUM to '
                               'S$25 million at S$10 billion.'),
                              ('Strategy', 'Private credit, digital assets and leveraged strategies are rated higher than long-only equity mandates.'),
                              ('Investor base', 'Retail and US investors raise claims exposure and the premium; institutional-only mandates rate lower.'),
                              ('Controls',
                               'An independent administrator and custodian, segregation of duties and dual payment authority reduce the crime rate.'),
                              ('Limit structure',
                               'One shared aggregate costs less than separate towers for PI, D&O and crime; separate towers protect the directors when PI is '
                               'exhausted.'),
                              ('Regulatory history', 'MAS inspection findings, investor complaints and prior notifications are priced in or excluded.')],
                    'file': ['MAS licence category and current AUM by fund',
                             'Latest audited accounts and base capital computation',
                             'Fund offering documents and investment mandates',
                             'Compliance manual, outsourcing list and administrator details',
                             'Claims, complaints and regulatory findings for the last five years',
                             'Current PII schedule and deductible'],
                    'pitfalls': [('Deductible above the MAS cap',
                                  'A Retail LFMC accepts a large excess to cut premium and the PII no longer meets the guideline, which caps the deductible at '
                                  '20% of base capital. Set the deductible against base capital first and price the premium second.'),
                                 ('Legal costs eat the minimum',
                                  'The policy limit equals the MAS minimum but defence costs sit inside it, so the amount left for client claims drops below '
                                  'the required figure. Buy costs in addition to the limit, or raise the limit to absorb them, as the guideline directs.'),
                                 ('Fund vehicles left off the schedule',
                                  'A new fund or SPV is launched after inception and is not an insured entity when a claim arrives. Use a wording with '
                                  'automatic cover for new funds and notify launches within the policy period.')],
                    'faqs': [('What professional indemnity does MAS require of fund managers?',
                              'MAS sets a minimum PII for Retail LFMCs by assets under management: S$2 million below S$100 million AUM, S$5 million from S$200 '
                              'million, S$11 million from S$500 million, S$21 million from S$1 billion and S$25 million from S$10 billion. The minimum applies '
                              'to each of three baseline areas: breach of professional duty, infidelity or dishonesty, and loss of documents of title. The '
                              'appendix does not set a figure for A/I LFMCs or VCFMs.'),
                             ('Why combine PI, D&O and crime in one policy?',
                              'One investor complaint can trigger all three: a mandate breach is a PI claim, the director who approved it faces a D&O claim, '
                              'and a payment diverted by a staff member is a crime loss. A combined policy removes the argument between three insurers over '
                              'which section pays. The trade-off is one aggregate limit; a separate Side A tower for directors can be added.'),
                             ('Does it cover the funds as well as the manager?',
                              'It can. The insured entities should list the management company, each fund vehicle, the general partner and any SPV. Fund '
                              'directors, including independent directors on Cayman or Singapore VCC boards, are insured persons. Wordings differ on automatic '
                              'cover for new funds; some include funds launched during the year within a size threshold, others require endorsement.'),
                             ('What is the crime section for?',
                              "Direct financial loss of the manager's or the fund's money from employee dishonesty, forgery, computer fraud, funds transfer "
                              'fraud and third-party theft. It is discovery-based: the loss must be discovered during the policy period. It does not cover '
                              'trading losses, underperformance or losses the manager cannot prove. Social engineering fraud is often a sub-limited extension '
                              'and should be checked.'),
                             ('Can a group policy from an overseas parent count?',
                              'MAS may accept a group PII if its cover is at least five times the standalone minimum, or a letter of undertaking from a parent '
                              'of satisfactory financial standing with liability equal to or above the minimum. If the group deductible exceeds 20% of the '
                              "Singapore entity's base capital, a parent undertaking for the excess is required. The broker documents this for the MAS file."),
                             ('What base capital is the deductible measured against?',
                              'Base capital is S$1,000,000 for fund management of a collective investment scheme offered to retail investors, S$500,000 for '
                              'non-CIS management for retail customers and S$250,000 for managers serving only accredited or institutional investors. An LFMC '
                              'must also hold financial resources of at least 120% of its total risk requirement. The PII deductible for a Retail LFMC must '
                              'not exceed 20% of base capital.')],
                    'sources': [('MAS: Guidelines on Licensing and Conduct of Business for FMCs (SFA 04-G05), 10 Dec 2024',
                                 'https://www.mas.gov.sg/-/media/mas-media-library/regulation/guidelines/cmg/guideline-sfa-04-g05-on-licensing-registration-and-conduct-of-business-for-fund-managers/sfa--guidelines-on-licensing-and-conduct-of-business-for-fmcs-10-dec-2024.pdf'),
                                ('MAS: SFA 04-G05 guideline page',
                                 'https://www.mas.gov.sg/regulation/guidelines/guideline-sfa-04-g05-on-licensing-registration-and-conduct-of-business-for-fund-managers')],
                    'competitors': ['chubb.com/sg-en/business/investment-managers-insurance.html',
                                    'chubb.com/content/dam/chubb-sites/chubb-com/sg-en/customer-service-pdfs/elite-investment-management-insurance-brochure.pdf',
                                    'ey.com/content/dam/ey-unified-site/ey-com/en-sg/industries/financial-services/documents/ey-sg-establishing-a-singapore-fund-manager-06-2026.pdf']},
 'commercial/medical-malpractice': {'title': 'Medical Malpractice Insurance Singapore | TRS',
                                    'description': 'Medical malpractice insurance in Singapore: claims-made cover for doctors, dentists and clinics, SMC '
                                                   'inquiry costs and run-off after retirement.',
                                    'intro': ['Medical malpractice insurance pays the damages and defence costs a doctor, dentist, allied health practitioner '
                                              'or clinic owes when a patient alleges negligent diagnosis, treatment or advice. It also funds legal '
                                              "representation before the Singapore Medical Council and at coroner's inquests. No Singapore statute makes it "
                                              'compulsory, but private hospitals require proof of cover before granting practising privileges, and doctors in '
                                              'public institutions have been covered by the MOH Holdings programme since 2017. Clinic licensees under the '
                                              'Healthcare Services Act buy entity cover for staff and locums.',
                                              'It is not cover for fines imposed for non-clinical breaches, nor for criminal acts. It is claims-made: the '
                                              'policy must be in force when the claim is made and reported, and a retroactive date sets how far back the '
                                              'treatment can go. The buyer chooses a limit per claim and per year, a deductible and a territory. The broker '
                                              'checks run-off terms for retirement, compares the discretionary cover of a defence organisation with a '
                                              'contractual policy, and arranges entity cover for the practice.'],
                                    'who': ['Private specialists and GPs who must show cover for hospital practising privileges.',
                                            'Dental practices, aesthetic clinics and day surgery centres licensed under the HCSA.',
                                            'Allied health professionals, TCM practitioners and physiotherapists in private practice.',
                                            'Group practices and medical centres employing doctors, nurses and locums.',
                                            'Telemedicine providers consulting patients outside Singapore.',
                                            'Nursing homes and long-term care operators with clinical staff.'],
                                    'price': [('Specialty',
                                               'Obstetrics, neurosurgery, spinal and aesthetic work are rated above general practice because awards are '
                                               'larger.'),
                                              ('Limit',
                                               'Higher limits for procedural specialties follow award sizes; the largest reported Singapore award is S$5.3 '
                                               'million against two treating doctors.'),
                                              ('Patient volume and hours',
                                               'Insurers rate on patients seen, procedures performed and hours worked, including locum sessions.'),
                                              ('Claims and SMC history',
                                               'Prior claims, complaints and SMC findings raise the rate; a single claim is not an automatic decline.'),
                                              ('Territory',
                                               'Telemedicine and medical tourism patients bring overseas jurisdictions; USA and Canada are excluded or priced '
                                               'separately.'),
                                              ('Entity cover',
                                               'Adding the clinic as an insured for staff and locums adds premium but closes the vicarious liability gap.')],
                                    'file': ['SMC, SDC or AHPC registration and specialty',
                                             'Hours worked, patient numbers and procedures per year',
                                             'Hospitals and clinics where the practitioner holds privileges',
                                             'Current cover, retroactive date and limit, or defence organisation membership',
                                             'Claims, complaints and SMC matters for the last ten years',
                                             'Telemedicine, overseas and locum work undertaken'],
                                    'pitfalls': [('Switching from a discretionary scheme without run-off',
                                                  'A doctor leaves a mutual defence organisation for an insured policy and loses assistance on incidents from '
                                                  'the membership years, because the old scheme was occurrence-based and the new policy is claims-made from '
                                                  'inception. Confirm in writing what the old scheme will still assist with, and match the retroactive date to '
                                                  'the gap.'),
                                                 ('Retirement with no run-off',
                                                  'The practitioner retires, stops paying, and a claim arrives four years later for a procedure done in the '
                                                  'last year of practice. Buy a policy with automatic run-off on retirement; the claim period runs three years '
                                                  'from when the patient first had knowledge, and for a child the clock starts at 21.'),
                                                 ('Clinic entity uninsured',
                                                  'Each doctor holds a personal policy but the clinic company, which the patient sues as employer of the nurse '
                                                  'or locum, has none. Add the practice entity as an insured with its own vicarious liability cover.')],
                                    'faqs': [('Is malpractice insurance compulsory for doctors in Singapore?',
                                              'No statute requires it and the 2016 SMC Ethical Code and Ethical Guidelines do not mandate it. In practice it '
                                              'is unavoidable: private hospitals require evidence of cover before granting practising privileges, and public '
                                              'healthcare institutions cover their doctors under the MOH Holdings programme administered by Marsh. A doctor '
                                              'without cover carries the full defence cost and any award personally.'),
                                             ('How long after treatment can a patient claim?',
                                              'Under section 24A of the Limitation Act, a personal injury action must be brought within three years of the '
                                              'cause of action, or three years from the date the patient first had the knowledge needed to sue, whichever is '
                                              'later. Under section 24, a minor has three years from turning 21, so a claim for treatment of an infant can '
                                              'arrive 24 years later. That is why run-off cover matters.'),
                                             ('Does it cover SMC disciplinary inquiries and fines?',
                                              'Legal representation at SMC complaints committee and disciplinary tribunal hearings is covered by most '
                                              "policies, as are coroner's inquests. Fines are different. A disciplinary tribunal can fine up to S$100,000 "
                                              'under section 53 of the Medical Registration Act, and most policies exclude fines and penalties. A few insurers '
                                              'cover fines that arise from a malpractice event. Read the fines clause.'),
                                             ('What is the difference between a defence organisation and an insurance policy?',
                                              'A mutual defence organisation offers discretionary assistance under its articles; it decides case by case '
                                              'whether and how much to help. An insurance policy is a contract enforceable in court with a stated limit and '
                                              'defined exclusions. Defence organisation cover is usually occurrence-based; insurance is claims-made. Moving '
                                              "between them needs the retroactive date and the old scheme's run-off position confirmed in writing."),
                                             ('What limit should a specialist carry?',
                                              'Match the limit to the worst plausible award in the specialty, not to the premium. The largest reported '
                                              'Singapore malpractice award is S$5.3 million against two treating doctors, and lifelong care costs rise with '
                                              'medical inflation. Hospitals may set a minimum in their credentialing terms. Check whether defence costs sit '
                                              'inside the limit and whether the limit is per claim or per year.'),
                                             ('Does the policy cover telemedicine and overseas patients?',
                                              'Only if the territory and jurisdiction clauses say so. Telemedicine is regulated under the Healthcare Services '
                                              "Act, and a consultation with a patient abroad can attract that country's courts. Many policies cover treatment "
                                              'worldwide with claims brought anywhere except USA and Canada. Declare overseas consulting, medical tourism '
                                              'patients and humanitarian work, which some wordings cap by days per year.')],
                                    'sources': [('MOH: Medical Registration (Amendment) Bill, fines up to S$100,000',
                                                 'https://www.moh.gov.sg/newsroom/medical-registration-(amendment)-bill/'),
                                                ('Limitation Act 1959, sections 24 and 24A', 'https://sso.agc.gov.sg/Act/LA1959'),
                                                ('SMC Ethical Code and Ethical Guidelines 2016',
                                                 'https://www.smc.gov.sg/guidelines/smc-ethical-code-and-ethical-guidelines-(2002-and-2016-editions)-and-handbook-on-medical-ethics-(2016-edition)'),
                                                ('MOH Holdings Medical Malpractice Insurance programme', 'https://www.mohh.com.sg/mmi')],
                                    'competitors': ['howdengroup.com/sg-en/medicalmalpractice',
                                                    'howdengroup.com/sg-en/choosing-your-limit-indemnity-medical-malpractice-howden-singapore',
                                                    'marsh.com/sg/services/financial-professional-liability/products/medefend.html',
                                                    'income.com.sg/commercial-insurance/medical-malpractice-insurance']},
 'commercial/cyber': {'title': 'Cyber Insurance Singapore | TRS',
                      'description': 'Cyber insurance in Singapore: breach response, ransomware, business interruption and PDPA liability, plus the controls '
                                     'insurers require.',
                      'intro': ['Cyber insurance pays the costs of responding to a network intrusion, ransomware event or data breach, and the liability that '
                                'follows. First-party costs include forensics, legal advice, notification, data restoration, extortion payments where lawful '
                                'and lost profit during an outage. Third-party cover answers claims by customers and regulatory investigations under the PDPA. '
                                'Singapore buyers span tech, finance, logistics, healthcare, retail and professional services. Large customers and government '
                                'bodies now require vendors to hold it, and boards ask for it after the CSA recorded 165 ransomware cases in 2025.',
                                'It is not cover for upgrading security after an incident, nor for losses the business could have prevented with the controls '
                                'it declared on the proposal form. Liability sections are claims-made with a retroactive date; first-party sections respond to '
                                'events discovered during the period. The buyer sets an aggregate limit, sub-limits for extortion and business interruption, a '
                                'waiting period for outages and a deductible. Insurers require multifactor authentication, offline backups and patch '
                                'management before quoting. The broker checks the controls, completes the questionnaire and runs the incident response panel.'],
                      'who': ['Any organisation holding personal data of 500 or more individuals, where a breach must be reported to the PDPC.',
                              'Vendors to banks, government agencies and multinationals whose contracts require cyber cover.',
                              'E-commerce, SaaS and fintech firms whose revenue stops when systems go down.',
                              'Clinics and healthcare groups holding patient records.',
                              'Manufacturers and logistics operators exposed to ransomware on operational systems.',
                              'Professional firms whose client files and payment instructions attract fraud.'],
                      'price': [('Revenue and records',
                                 'Insurers rate on turnover and the number of personal data records held; both set the size of a breach.'),
                                ('Controls',
                                 'Multifactor authentication, offline backups, endpoint detection and patch timelines decide whether a quote is offered and at '
                                 'what rate.'),
                                ('Sector', 'Healthcare, finance and critical infrastructure rate higher because records are sensitive and downtime is costly.'),
                                ('Limit and sub-limits',
                                 'The aggregate limit plus sub-limits for extortion, business interruption and social engineering drive the premium.'),
                                ('Waiting period', 'A longer waiting period before business interruption cover starts lowers the premium.'),
                                ('Incident history', 'Prior ransomware, breaches or PDPC findings are priced in; an undeclared incident voids the policy.')],
                      'file': ['Annual turnover and number of personal data records held',
                               'Completed insurer security questionnaire or self-assessment',
                               'Evidence of multifactor authentication, backups and patching cadence',
                               'Incident, breach and PDPC notification history for five years',
                               'List of critical IT vendors and cloud providers',
                               'Contracts that require a stated cyber limit'],
                      'pitfalls': [('Security answers do not match reality',
                                    'The proposal says MFA is enforced everywhere and the breach comes through an unprotected VPN account, so the insurer '
                                    'declines for misrepresentation. Have IT verify every control answer and keep the evidence before signing.'),
                                   ('PDPC deadline missed',
                                    'The breach is found, the IT team spends weeks on recovery, and no one assesses whether it is notifiable, so the '
                                    'organisation breaches the Data Breach Notification Obligation on top of the breach itself. Assess within 30 calendar days '
                                    'of discovery and notify the PDPC within three calendar days of deciding it is notifiable.'),
                                   ('Vendor outage not covered',
                                    'A cloud provider or payment processor goes down, the business loses a week of sales, and the policy covers only outages '
                                    'of its own network. Buy contingent business interruption with the key vendors named.')],
                      'faqs': [('When must a data breach be reported to the PDPC?',
                                'A breach is notifiable if it results in, or is likely to result in, significant harm to affected individuals, or if it '
                                'affects 500 or more individuals. The organisation must assess within 30 calendar days of having credible grounds to believe a '
                                'breach occurred, and notify the PDPC as soon as practicable and within three calendar days of determining it is notifiable. '
                                'Affected individuals are told at the same time or after.'),
                               ('How much can the PDPC fine?',
                                'From 1 October 2022 the maximum financial penalty for breaching the data protection provisions is 10% of annual Singapore '
                                'turnover for organisations with turnover above S$10 million, and S$1 million for all others. In October 2025 the PDPC fined '
                                'Marina Bay Sands S$315,000 for a 2023 breach affecting more than 600,000 patrons. Whether a fine is insurable depends on the '
                                'wording and the law.'),
                               ('Does cyber insurance pay a ransom?',
                                "Most policies include cyber extortion cover that reimburses a ransom payment and the negotiator's fees, subject to a "
                                "sub-limit and the insurer's prior consent. Payment must be lawful; sanctions screening is done before any transfer. Insurers "
                                'prefer restoration from offline backups, which is why tested backups are a condition of cover and a ransom is the last '
                                'resort.'),
                               ('What security controls do insurers require before quoting?',
                                'The baseline in the Singapore market is multifactor authentication on remote access and email, offline or disconnected '
                                'backups tested for restoration, and formal patch management with faster fixes for high and critical vulnerabilities. Larger '
                                'firms are asked for endpoint detection and response, privileged access management and an incident response plan. Weaker '
                                'controls mean a higher premium, lower sub-limits or a declined quote.'),
                               ('Is business interruption covered?',
                                'Yes, for net profit lost and extra expense incurred while systems are down after a covered event, once a waiting period has '
                                'passed. Cover for outages at a cloud or technology vendor is a separate extension, usually sub-limited and sometimes '
                                'restricted to named providers. Loss of revenue from reputational harm after systems are restored is a further extension on '
                                'some wordings.'),
                               ('Does the policy cover payment fraud by email?',
                                'Only under a social engineering or funds transfer fraud extension, which is often sub-limited well below the main limit. The '
                                'loss is money the business was tricked into paying, not data. In November 2025 a Singapore logistics firm received a '
                                'payment-redirection email for US$18,288; that is the shape of the claim. Dual authorisation on bank detail changes is usually '
                                'a condition of the extension.')],
                      'sources': [('PDPC: Guide on Managing and Notifying Data Breaches under the PDPA',
                                   'https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Other-Guides/Guide-on-Managing-and-Notifying-Data-Breaches-under-the-PDPA-15-Mar-2021.pdf'),
                                  ('PDPC: financial penalty on Marina Bay Sands, Oct 2025',
                                   'https://www.pdpc.gov.sg/news-and-events/press-room/2025/10/pdpc-imposes-financial-penalty-on-marina-bay-sands-for-data-breach'),
                                  ('Personal Data Protection Act 2012, section 48J penalties', 'https://sso.agc.gov.sg/Act/PDPA2012'),
                                  ('CSA: Singapore Cyber Landscape 2025/2026',
                                   'https://www.csa.gov.sg/resources/publications/singapore-cyber-landscape-2025-2026/')],
                      'competitors': ['howdengroup.com/sg-en/cover/cyber-insurance-howden-singapore',
                                      'chubb.com/sg-en/business/cyber-insurance.html',
                                      'thestar.com.my/aseanplus/aseanplus-news/2026/09/14/cyber-insurance-gains-ground-in-singapore-as-coverage-widens-premiums-fall']},
 'commercial/workmen': {'title': 'Work Injury Compensation Insurance Singapore | TRS',
                        'description': 'Work injury compensation insurance in Singapore: who MOM requires you to insure, the S$2,600 salary line and the '
                                       'limits in force from 1 Nov 2025.',
                        'intro': ['Work injury compensation insurance pays the compensation an employer owes under the Work Injury Compensation Act (WICA) '
                                  'when an employee is injured or falls ill because of work. It is a no-fault scheme: the employee does not have to prove '
                                  'negligence. Every employer in Singapore with a manual worker, or a non-manual worker earning S$2,600 a month or less, must '
                                  'hold a policy. Main contractors, tenderers and landlords ask for the certificate before work starts, and MOM checks it when '
                                  'an accident is reported.',
                                  'It is not medical insurance for illness unrelated to work and it is not personal accident cover. The policy is annual, '
                                  'bought on an estimated wage roll and headcount, and must be issued by an MOM-designated insurer on compulsory terms. '
                                  'Payouts follow the WICA scale, so the cover does not have a sum insured; the variable is the common law limit, the sum the '
                                  'insurer pays if an employee sues outside WICA instead. The broker fixes the occupation classes, declares the wages, adds '
                                  'non-compulsory staff where it pays to, and runs the claim from the accident report to the payment.'],
                        'who': ['Any employer with a manual worker, from construction crews to kitchen staff and warehouse hands',
                                'Employers of non-manual staff earning S$2,600 a month or less, including part-timers',
                                'Main contractors and subcontractors who must show a current policy before site entry',
                                'Employers of Work Permit and S Pass holders doing manual work, local and foreign alike',
                                'Platform operators, who must insure platform workers under WICA from 1 January 2025',
                                'Offices that choose to cover every employee so the WICA claim and the common law suit sit with one insurer'],
                        'price': [('Occupation class',
                                   'Manual trades such as construction, marine and logistics are rated several times higher than office staff.'),
                                  ('Declared wage roll',
                                   'Premium is a rate on the annual wages declared; a low declaration is adjusted at year end or at claim.'),
                                  ('Claims history', 'Three years of accident reports and MOM notices decide whether the insurer loads, excludes or declines.'),
                                  ('Common law limit',
                                   'Raising the limit from S$10 million to S$15 million or more adds premium; the WICA layer itself is fixed by law.'),
                                  ('Headcount and turnover',
                                   'Large or fast-changing crews pay for the flexibility of an unnamed policy adjusted on declaration.'),
                                  ('Safety record', 'A bizSAFE level, a WSH officer and a documented site programme support a lower rate at renewal.')],
                        'file': ['Employee list by occupation, with manual and non-manual split',
                                 'Annual wage roll for each class, excluding overtime and bonuses',
                                 'Accident and claims history for the past three years',
                                 'Main activities, sites and any work at height, hot work or offshore',
                                 'Current policy schedule and expiry date, if renewing',
                                 'Work Permit and S Pass headcount with nationalities'],
                        'pitfalls': [('Insuring only the compulsory group',
                                      'An uninsured employee who earns above S$2,600 can still claim under WICA, and the employer pays the award from its own '
                                      'funds. Cover the whole payroll; the premium for office staff is small against a death award of up to S$269,000.'),
                                     ('Under-declaring the wage roll',
                                      'A declared wage roll below the true figure leaves the insurer entitled to adjust or to scale the payout. Declare actual '
                                      'wages at inception and update when headcount changes, not only at renewal.'),
                                     ('Missing the 10-day report',
                                      'A non-fatal accident with medical leave or light duty must be reported to MOM within 10 days of first notice; a fatal '
                                      "one within 10 days of the accident. Set the report as the site manager's task on the day of the accident, and copy the "
                                      'broker.')],
                        'faqs': [('Who must I insure under WICA?',
                                  'All employees doing manual work, whatever their salary, and all non-manual employees earning S$2,600 a month or less. The '
                                  'salary test uses basic pay and excludes overtime, bonus, annual wage supplement, productivity incentives and allowances. '
                                  'Local and foreign employees count equally. Other employees may be insured at your choice, but a valid WICA claim from them '
                                  'must still be paid.'),
                                 ('What are the compensation limits in 2026?',
                                  'For accidents from 1 November 2025: medical expenses up to S$53,000 or one year from the accident, whichever comes first; '
                                  'permanent incapacity between S$116,000 and S$346,000 scaled by the percentage of incapacity; death between S$91,000 and '
                                  'S$269,000. Medical leave wages are full average monthly earnings for 14 outpatient days or 60 hospitalisation days, then '
                                  'two-thirds up to one year.'),
                                 ('What happens if I have no policy?',
                                  'Failing to insure is an offence with a fine of up to S$10,000, jail of up to 12 months, or both. The compensation itself is '
                                  'still owed. MOM assesses the claim and serves a notice of assessment on the employer, who pays from company funds.'),
                                 ('Does the policy cover a lawsuit by the employee?',
                                  'WICA compensation and a common law claim are alternatives; an employee may sue for negligence instead of claiming under '
                                  'WICA. Policies in Singapore add a common law section for this, with limits in insurer product sheets of S$10 million to '
                                  'S$15 million. Check the limit matches the contract or tender requirement before you sign.'),
                                 ('Is an accident overseas or at home covered?',
                                  'Yes, where it arises out of and in the course of work. MOM lists accidents on an overseas assignment and accidents during '
                                  'agreed work-from-home or flexible arrangements as eligible. Travel to and from work on normal commuting is not, unless it '
                                  'is company transport. The employer still reports within 10 days.'),
                                 ('How fast must I pay after an accident?',
                                  'Medical leave wages are due by the next payday after you receive the original medical certificates, even while the insurer '
                                  'is still processing. Medical bills are paid direct to the hospital, or reimbursed to the employee within 14 days of '
                                  'receiving the original bill. The insurer refunds you. The employee can claim up to one year after the accident.')],
                        'sources': [('MOM: work injury compensation insurance',
                                     'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                                    ('MOM: types of compensation',
                                     'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation'),
                                    ('MOM: employers, what to do during a claim',
                                     'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/employers-what-to-do-during-a-claim'),
                                    ('MOM: who is covered under WICA',
                                     'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/who-is-covered')],
                        'competitors': ['howdengroup.com/sg-en/cover/wic-insurance',
                                        'chubb.com/sg-en/business/work-injury-compensation.html',
                                        'dollarbureau.com/blog/best-work-injury-compensation-insurance-singapore/',
                                        'libertyinternational.com/sg/article/employers-guide-worker-injury-compensation-insurance-and-foreign-worker-medical-insurance']},
 'commercial/foreign-worker': {'title': 'Foreign Worker Medical Insurance Singapore | TRS',
                               'description': 'Foreign worker medical insurance in Singapore: the S$60,000 MOM minimum, the employer co-payment above S$15,000 '
                                              'and the Primary Care Plan.',
                               'intro': ['Foreign worker medical insurance is the inpatient and day surgery policy MOM requires for every Work Permit and S '
                                         'Pass holder. It pays the hospital bill for illness or injury, work-related or not, up to a minimum of S$60,000 a '
                                         'year. The trigger is the pass itself: MOM will not issue or renew a Work Permit or S Pass until the employer has '
                                         'entered the insurer, policy number and dates in WP Online. Construction, marine, process, manufacturing, services '
                                         'and domestic employers all buy it.',
                                         'It is not outpatient cover and it is not work injury compensation, which is a separate WICA policy. The policy is '
                                         'annual or matched to the pass, priced per worker in two age bands, 50 and below and above 50, and must follow the '
                                         "Stage 2 terms from 1 July 2025: insurer pays 75% of any claim above S$15,000, the employer 25%, and only MOM's "
                                         'allowable exclusions may apply. The broker places the headcount, checks every sub-limit meets S$60,000, adds a '
                                         'buy-back of the 25% where wanted, and keeps the declarations current.'],
                               'who': ['Any employer of a Work Permit holder, before the permit is issued and at every renewal',
                                       'Employers of S Pass holders, who face the same S$60,000 minimum',
                                       'Construction, marine shipyard and process firms, who also enrol dormitory workers in a Primary Care Plan',
                                       'Households employing a migrant domestic worker',
                                       'Employers with workers on policies longer than two years, who must move to Stage 2 terms by 30 June 2027',
                                       'Groups holding several policies that together must reach the S$60,000 and 75% tests'],
                               'price': [('Age band', 'Workers above 50 are priced in a separate, higher band under the Stage 2 rules.'),
                                         ('Claim limit above the minimum',
                                          'A S$100,000 or S$150,000 annual limit costs more than the S$60,000 floor but caps large bills.'),
                                         ('Co-payment buy-back',
                                          "A rider that takes the employer's 25% share above S$15,000 adds premium and removes the open exposure."),
                                         ('Headcount and sector',
                                          'Large manual workforces in construction and marine carry higher claim frequency than services headcounts.'),
                                         ('Claims experience', 'Group loss ratios from the last two or three years set the renewal rate and any loading.'),
                                         ('Policy term',
                                          'A 24-month policy matched to the Work Permit avoids a mid-term gap and a second administration cycle.')],
                               'file': ['Worker list with FIN, date of birth and pass type',
                                        'Sector and occupation of each worker',
                                        'Policy start date matched to the Work Permit or S Pass',
                                        'Claims history for the group, two to three years',
                                        'Existing policy schedules where several policies are combined',
                                        'Whether a Primary Care Plan is already in place for dormitory or CMP workers'],
                               'pitfalls': [("Treating the 25% co-payment as the worker's",
                                             'The insurance cost cannot be passed to the worker, and a co-pay arrangement is allowed only if it is in the '
                                             'contract, with consent, capped at 10% of fixed monthly salary and no more than six months in every two years. '
                                             'Budget the employer share, or buy the buy-back rider.'),
                                            ('Letting a sub-limit fall below S$60,000',
                                             'MOM requires each sub-limit for inpatient, day surgery and per condition to meet the S$60,000 minimum, not only '
                                             'the overall annual cap. Read the schedule line by line before entering it in WP Online.'),
                                            ("Assuming the worker's own plan or the Primary Care Plan is enough",
                                             "An individual plan held by the worker does not discharge the employer's duty, and the Primary Care Plan covers "
                                             'only primary care. Buy the employer policy for every Work Permit and S Pass holder and keep the PCP alongside it '
                                             'where required.')],
                               'faqs': [('What is the minimum cover in 2026?',
                                         'At least S$60,000 a year for each Work Permit and S Pass holder, covering inpatient care and day surgery for '
                                         'conditions that may not be work-related, for the whole validity of the pass. Each sub-limit must also meet S$60,000. '
                                         'For claims above S$15,000 the insurer pays at least 75% and the employer 25%. Policies that started before 1 July '
                                         '2023 could keep S$15,000 until their next renewal.'),
                                        ('Can I pass the cost or the co-payment to the worker?',
                                         'The premium cannot be recovered from the worker. A co-payment arrangement is permitted, except for migrant domestic '
                                         "workers, only where the amount is reasonable and at most 10% of the worker's fixed monthly salary, the duration is "
                                         'at most six months in every two years of employment, and the term is written into the employment contract or '
                                         "collective agreement with the worker's consent."),
                                        ('Can insurers still exclude pre-existing conditions?',
                                         "Only within MOM's standardised list for policies starting on or after 1 July 2025. A pre-existing condition known to "
                                         'the employer or the worker may be excluded only in the first 12 months of employment with the same employer. '
                                         'Pregnancy, cosmetic procedures, non-accident dental, treatment outside Singapore and bills already paid under WICA '
                                         'remain allowable exclusions.'),
                                        ('What is the Primary Care Plan and who needs it?',
                                         'A capitated outpatient plan bought from an MOM-appointed anchor operator. It has been mandatory since 1 April 2022 '
                                         'for Work Permit and S Pass holders who live in dormitories or work in construction, marine shipyard or process. It '
                                         'covers consultations, telemedicine and an annual screening with a fixed S$5 co-payment per visit from 1 April 2027. '
                                         'It does not replace the medical insurance.'),
                                        ('Does an S Pass or Employment Pass holder need this policy?',
                                         'S Pass holders yes, on the same S$60,000 minimum and 75/25 co-payment as Work Permit holders, bought before the pass '
                                         'is issued or renewed. Employment Pass holders no; MOM does not require employer medical insurance for them, though '
                                         'many employers include them in the group medical plan.'),
                                        ('Can I combine policies or buy back the 25%?',
                                         'Yes to both. MOM accepts several policies together provided they give a yearly maximum of at least S$60,000 and '
                                         'insurers pay at least 75% above the first S$15,000. Employers may also buy riders that reimburse the 25% employer '
                                         'share up to the annual limit, so the exposure above S$15,000 is closed off.')],
                               'sources': [('MOM: medical insurance for Work Permit holders',
                                            'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance'),
                                           ('MOM: medical insurance for S Pass holders', 'https://www.mom.gov.sg/passes-and-permits/s-pass/medical-insurance'),
                                           ('MOM: list of allowable exclusions (PDF)',
                                            'https://www.mom.gov.sg/-/media/mom/documents/work-passes-and-permits/standardised-allowable-exclusions-for-medical-insurers.pdf'),
                                           ('MOM: enhanced Primary Care Plan from 1 April 2027',
                                            'https://www.mom.gov.sg/newsroom/press-releases/2025/1214-enhanced-pcp')],
                               'competitors': ['libertyinternational.com/sg/article/employers-guide-worker-injury-compensation-insurance-and-foreign-worker-medical-insurance',
                                               'marsh.com/sg/services/small-business-insurance/products/foreign-workers-bonds-and-foreign-worker-medical-insurance.html',
                                               'osome.com/sg/guides/security-bond-for-foreign-workers/']},
 'commercial/foreign-worker-bond': {'title': 'Foreign Worker Security Bond Singapore | TRS',
                                    'description': 'The S$5,000 MOM security bond for non-Malaysian Work Permit holders in Singapore: when it must be in '
                                                   'force, what forfeits it and how it is discharged.',
                                    'intro': ['A foreign worker security bond is the S$5,000 guarantee MOM requires from an employer for each non-Malaysian '
                                              'Work Permit holder. It is a promise to pay the Government if the employer or the worker breaks the Work Permit '
                                              "or bond conditions. An insurer's guarantee replaces a bank guarantee or cash deposit, so the employer keeps its "
                                              'cash. The trigger is the In-Principle Approval: the bond must be lodged with MOM and in force on the day the '
                                              'worker lands, or immigration will not admit the worker.',
                                              "It is not insurance for the employer's own loss: if MOM forfeits the bond, the insurer pays MOM and recovers "
                                              'the sum from the employer under a counter-indemnity. The bond runs for a fixed term matched to the permit, is '
                                              'bought per worker, and is discharged about one week after the permit is cancelled and the worker has left '
                                              'Singapore, provided no condition was breached. The broker lodges the bond electronically, tracks expiry against '
                                              'the permit, and handles the discharge or any forfeiture notice.'],
                                    'who': ['Any employer bringing in a non-Malaysian Work Permit holder, before the worker arrives',
                                            'Construction, marine shipyard and process contractors onboarding crews in bulk',
                                            'Manufacturing and services firms renewing Work Permits on a rolling basis',
                                            'Employers who prefer not to lock S$5,000 per worker in a bank guarantee',
                                            'Households employing a migrant domestic worker from outside Malaysia'],
                                    'price': [('Bond term',
                                               'A term matched to a 24-month permit costs more than a 12-month term but avoids a second lodgement.'),
                                              ('Number of workers',
                                               'Insurers set a per-company aggregate, so very large crews may need a second carrier or a bank line.'),
                                              ('Forfeiture history',
                                               'Previous forfeitures or MOM infringements lead to a declined bond or a cash collateral request.'),
                                              ('Sector', 'Sectors with higher absconding rates are rated above office-based employers.'),
                                              ('Company standing',
                                               'ACRA status, years in operation and CPF compliance are checked before a counter-indemnity is accepted.')],
                                    'file': ['In-Principle Approval letter or MOM renewal notice for each worker',
                                             'Company UEN, SSIC code and CPF submission number',
                                             'Worker name, FIN and nationality',
                                             'Required start date, at least three working days ahead',
                                             'Any past bond forfeitures or MOM enforcement action'],
                                    'pitfalls': [('Lodging too late',
                                                  'The bank or insurer needs up to three working days to send the bond details to MOM, and the bond must be in '
                                                  'effect when the worker arrives. Buy the bond as soon as the In-Principle Approval is issued, not when the '
                                                  'flight is booked.'),
                                                 ('Treating the bond as cover for the employer',
                                                  'Forfeiture is a payment to MOM, and the insurer claims the full sum back from the employer under the '
                                                  'counter-indemnity. Keep salary on time, repatriate on expiry and report a missing worker at once; those are '
                                                  'the conditions that protect the bond.'),
                                                 ('Forgetting discharge',
                                                  'A bond stays live until the permit is cancelled and the worker has left; an expired bond on a renewed '
                                                  'permit breaks a Work Permit condition. Diary the permit renewal and the bond expiry together, and ask for '
                                                  'the discharge letter after departure.')],
                                    'faqs': [('How much is the bond and who pays it?',
                                              "S$5,000 for each non-Malaysian Work Permit holder, bought from any bank or insurance company as a banker's or "
                                              "insurer's guarantee. The employer pays; MOM states you cannot ask the worker to pay for it. Malaysian Work "
                                              'Permit holders and S Pass holders do not need a bond.'),
                                             ('When must the bond be in force?',
                                              'Before the worker arrives in Singapore. After purchase, the bank or insurer sends the details to MOM, which can '
                                              'take up to three working days, and the bond must take effect on the day of arrival. If it is not in effect, the '
                                              'immigration officer will not allow the worker to enter.'),
                                             ('What causes the bond to be forfeited?',
                                              'MOM may forfeit the bond if the employer or worker breaks a Work Permit or bond condition, the salary is not '
                                              'paid on time, the worker is not sent home after the permit expires, is revoked or is cancelled, the worker goes '
                                              'missing, or a construction, marine shipyard or process worker is not sent for the Onboard programme.'),
                                             ('Am I liable if the worker breaks the rules?',
                                              "Not for the worker's own violations, if you can prove you informed the worker of the Work Permit conditions and "
                                              'reported the violation to MOM when you first became aware of it. Keep a signed acknowledgement of the '
                                              'conditions on file and report a missing worker in writing the same day.'),
                                             ('When is the bond released?',
                                              'Only when the Work Permit has been cancelled, the worker has returned home and no bond condition was breached. '
                                              'MOM usually discharges the bond one week after the worker leaves Singapore and notifies the employer by post. '
                                              'The insurer then closes the bond; premiums already paid are generally not refunded.'),
                                             ('Does the bond replace medical insurance or WICA?',
                                              'No. The bond, the S$60,000 foreign worker medical insurance and work injury compensation insurance are three '
                                              'separate obligations. The medical policy details must be entered in WP Online before the permit is issued, and '
                                              'WICA cover applies to every manual worker regardless of nationality.')],
                                    'sources': [('MOM: security bond requirements for migrant workers',
                                                 'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/security-bond'),
                                                ('MOM: medical insurance for Work Permit holders',
                                                 'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance'),
                                                ('MOM: work injury compensation insurance',
                                                 'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance')],
                                    'competitors': ['marsh.com/sg/services/small-business-insurance/products/foreign-workers-bonds-and-foreign-worker-medical-insurance.html',
                                                    'osome.com/sg/guides/security-bond-for-foreign-workers/',
                                                    'msig.com.sg foreign worker bond product page (node/4436)']},
 'employees/medical': {'title': 'Group Medical Insurance Singapore | TRS',
                       'description': 'Group medical insurance in Singapore: hospital and surgical cover from two employees, the IRAS deduction caps and '
                                      'pre-existing conditions.',
                       'intro': ['Group medical insurance is a hospital and surgical policy an employer buys for its staff, usually with outpatient GP, '
                                 'specialist and dental riders. In Singapore it is voluntary for local employees and Employment Pass holders, and compulsory '
                                 'in a different form for Work Permit and S Pass holders. The trigger is hiring: an offer letter that promises medical '
                                 'benefits, a parent company group standard, a tender that asks for it, or an investor checklist. Companies from two employees '
                                 'upwards buy it.',
                                 'It is not a substitute for MediShield Life, which stays in force, and it is not work injury cover. The policy is annual, '
                                 'priced per head by plan tier and age, with room and board set by ward class and an annual limit per employee. Most plans are '
                                 'issued on a group basis without individual medical questions above a minimum headcount. The broker benchmarks the plan '
                                 "against the market, tests the insurer's wording on pre-existing conditions and portability, and runs the renewal on claims "
                                 'data.'],
                       'who': ['Start-ups and SMEs from two employees writing a first benefits package',
                               'Regional headquarters matching a parent company plan for Singapore staff',
                               'Employers of Work Permit and S Pass holders who want one plan above the MOM minimum',
                               'Firms with ageing or long-serving staff where individual cover would be declined or loaded',
                               'Employers using the Portable Medical Benefits Scheme or TMIS to lift the tax deduction to 2%',
                               'Companies adding dependants, dental or outpatient riders at renewal'],
                       'price': [('Ward class and annual limit',
                                  'A private hospital single-bed plan with a S$200,000 limit costs several times a B1 ward plan.'),
                                 ('Age profile', 'Insurers rate by age band, so a workforce over 50 pays more per head than a young one.'),
                                 ('Headcount', 'Larger groups get experience rating and fewer medical questions; very small groups follow book rates.'),
                                 ('Claims ratio', "A loss ratio above the insurer's target leads to a loading or a plan redesign at renewal."),
                                 ('Riders', 'Outpatient GP, specialist, dental and maternity riders each add a per-head premium and drive claims frequency.'),
                                 ('Co-payment and deductible', 'A 10% co-payment or a per-visit deductible cuts premium and claim volume.')],
                       'file': ['Employee census with date of birth, gender, pass type and plan tier',
                                'Current benefit schedule and policy wording',
                                'Two to three years of claims experience by benefit',
                                'Dependants to be included and who pays for them',
                                'Employee handbook wording on medical benefits',
                                'Whether a portable scheme (PMBS, TMIS or Shield plan) is in place'],
                       'pitfalls': [('Promising benefits the policy does not deliver',
                                     'A handbook that says "full medical cover" and a policy with a S$20,000 limit leave the employer paying the gap. Align '
                                     'the handbook to the schedule and state the ward class, limit and co-payment in writing.'),
                                    ('Ignoring the IRAS cap',
                                     'Medical expenses, including group medical premiums, are deductible only up to 1% of total employee remuneration, or 2% '
                                     'with a qualifying portable scheme; the excess is disallowed. Model the cap before adding riders, and consider PMBS or '
                                     'TMIS if you are close to it.'),
                                    ('Assuming pre-existing conditions are covered',
                                     'Many plans exclude or impose waiting periods on pre-existing conditions for small groups and late joiners. Ask for the '
                                     'exact wording and the free cover limit before enrolling staff, and declare known conditions where the insurer asks.')],
                       'faqs': [('Is group medical insurance compulsory in Singapore?',
                                 'Not for local employees or Employment Pass holders. It is compulsory for Work Permit and S Pass holders, who must have '
                                 'inpatient and day surgery cover of at least S$60,000 a year under MOM rules. Separately, the Employment Act gives eligible '
                                 'employees up to 14 days of paid outpatient sick leave and 60 days of paid hospitalisation leave after three months of '
                                 'service.'),
                                ('How much of the premium can the company deduct?',
                                 'Medical expenses, which IRAS defines to include premiums on medical and dental insurance, are deductible up to 1% of total '
                                 'employee remuneration for the year. The cap rises to 2% if the employer runs the Portable Medical Benefits Scheme, the '
                                 'Transferable Medical Insurance Scheme or provides portable Shield plans. Spend above the cap is not deductible.'),
                                ('What makes a plan portable?',
                                 'Under PMBS the employer pays an extra MediSave contribution of at least 1% of gross monthly salary, minimum S$16 a month, '
                                 'for at least 20% of local employees and every new local hire. Under TMIS the group hospital plan keeps inpatient cover for '
                                 'up to 12 months after an employee leaves, for at least 50% of local employees. A Shield plan option covers at least 20% of '
                                 'local staff.'),
                                ('Are pre-existing conditions covered?',
                                 'It depends on the wording and the group size. Larger groups are usually accepted without medical questions and pre-existing '
                                 'conditions are covered from day one; smaller groups and late entrants may face exclusions or a waiting period. Insurers also '
                                 'set a free cover limit, the benefit issued without underwriting. Get the clause in writing before enrolment.'),
                                ("Is the premium taxable in my employees' hands?",
                                 'IRAS treats employer-paid insurance as a benefit-in-kind, but applies a concession for group medical insurance provided in '
                                 'place of medical costs the employer would otherwise reimburse, where the benefit is available to all staff. Under the '
                                 'concession the premium is not taxed on the employee. The concession does not apply to investment holding companies or '
                                 'cost-plus service companies.'),
                                ('How small can the group be?',
                                 "Insurer packaged schemes in Singapore start at two full-time employees. Below the insurer's threshold, usually around 10 to "
                                 '20 lives, staff are enrolled on a packaged plan at book rates with limited choice of ward class and riders. Above it the '
                                 "plan is customised and rated on the group's own claims experience.")],
                       'sources': [('MOM: portable medical benefits for employees',
                                    'https://www.mom.gov.sg/employment-practices/schemes-for-employers-and-employees/portable-medical-benefits'),
                                   ('IRAS: tax treatment of business expenses, medical expenses',
                                    'https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(m-r)'),
                                   ('IRAS: tax treatment of business expenses, insurance premiums',
                                    'https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(g-l)'),
                                   ('MOM: sick leave eligibility and entitlement',
                                    'https://www.mom.gov.sg/employment-practices/leave/sick-leave/eligibility-and-entitlement')],
                       'competitors': ['howdengroup.com/sg-en/employee-benefits/group-medical-insurance',
                                       'greateasternlife.com/sg/en/corporate-solutions/employee-benefits/group-insurance.html',
                                       'dollarsandsense.sg/business/guide-to-understanding-group-health-insurance-plans-in-singapore/',
                                       'cigna.com.sg/group-health-insurance/faq']},
 'employees/benefits': {'title': 'Employee Benefits Insurance Singapore | TRS',
                        'description': 'Employee benefits insurance in Singapore: group term life, accident, hospital and outpatient in one programme, and how '
                                       'IRAS treats premiums.',
                        'intro': ['Employee benefits insurance is the package of group policies an employer funds for staff: term life, personal accident, '
                                  'hospital and surgical, outpatient, dental and critical illness. In Singapore it sits on top of the statutory layer of CPF, '
                                  'work injury compensation and Employment Act leave. The trigger is usually a hiring plan, a parent company standard, a '
                                  'collective agreement or an investor due diligence list. Companies from two employees buy packaged schemes; larger firms '
                                  'build a custom programme.',
                                  'It is not a pension and it is not a replacement for the compulsory work injury or foreign worker medical policies. Each '
                                  'line is an annual group policy, priced per head, with sums assured set as a multiple of salary or a flat amount and a free '
                                  'cover limit below which no medical evidence is needed. The broker designs the tiers, places each line with the insurer best '
                                  'priced for it, aligns the policy wording with the staff handbook and manages joiners, leavers and claims through the year.'],
                        'who': ['Start-ups and SMEs from two employees writing their first benefits package',
                                'Regional offices that must match a group benefits standard in Singapore',
                                'Firms under a collective agreement with insured death and disability benefits',
                                'Employers replacing ad hoc reimbursements with an insured, budgeted plan',
                                'Professional practices that need cover for partners and staff alike',
                                'Companies preparing for a funding round or acquisition due diligence'],
                        'price': [('Lines included',
                                   'Term life and personal accident are cheap per head; hospital and outpatient riders carry most of the cost.'),
                                  ('Sum assured basis',
                                   'A 36-month salary multiple costs more than a flat S$100,000, and sums above the free cover limit need medical evidence.'),
                                  ('Age and occupation profile', 'Older groups and manual occupations are rated higher on both life and accident lines.'),
                                  ('Headcount', 'Packaged schemes for under 50 lives use book rates; larger groups are rated on their own experience.'),
                                  ('Claims history', 'Two to three years of medical claims data sets the renewal for the hospital and outpatient lines.'),
                                  ('Dependant cover', 'Adding spouses and children raises the medical premium and the claim count.')],
                        'file': ['Employee census with date of birth, gender, salary band and occupation',
                                 'Benefit design by tier: sums assured, ward class, limits, riders',
                                 'Existing policy schedules and renewal dates for each line',
                                 'Claims experience for the past two to three years',
                                 'Staff handbook or collective agreement wording on benefits',
                                 'Headcount forecast for the policy year'],
                        'pitfalls': [('Mismatch between handbook and policy',
                                      'The handbook promises a benefit the policy limits or excludes, and the employer funds the difference. Write the '
                                      'handbook from the policy schedule, not the other way round, and update both at renewal.'),
                                     ('Missing the free cover limit',
                                      'A senior hire with a sum assured above the free cover limit is enrolled without medical evidence and the claim is '
                                      'declined. Check the limit at every joiner, and get the medical done before the cover is confirmed.'),
                                     ('Claiming a deduction and taxing staff twice',
                                      'For group policies other than medical, the premium is a taxable benefit to the employee unless the employer elects not '
                                      'to claim the deduction, and the election must cover every employee on the policy. Decide the treatment line by line '
                                      'with your tax adviser before the first payroll.')],
                        'faqs': [('What does a typical Singapore programme contain?',
                                  'Group term life for death and total permanent disability, group personal accident for accidental death and disablement, '
                                  'group hospital and surgical with a major medical rider, and outpatient GP and specialist riders. Dental, critical illness, '
                                  'long-term disability and dependant cover are added by tier. Work injury compensation and foreign worker medical insurance '
                                  'are bought separately because MOM sets their terms.'),
                                 ('Can the company deduct the premiums?',
                                  'Yes for group policies where employees or their nominees are the beneficiaries, and from year of assessment 2019 also where '
                                  'the employer is the named beneficiary with no obligation to pass on the payout; those payouts are then taxable to the '
                                  'employer. Premiums on policies with a cash surrender or investment value are capital and not deductible. Medical premiums '
                                  'fall under the 1% or 2% medical expenses cap.'),
                                 ('Are the premiums taxed on employees?',
                                  'IRAS treats employer-paid insurance as a benefit-in-kind. Two concessions apply: group medical provided in place of '
                                  'reimbursed medical costs and open to all staff, and other group insurance where the employer elects not to claim the '
                                  'premium as a deduction. The election must apply to every employee covered. Investment holding and cost-plus service '
                                  'companies are outside the concessions.'),
                                 ('Is there a minimum number of employees?',
                                  'Packaged schemes from Singapore insurers start at two full-time employees, with term life and hospital cover issued without '
                                  'medical examination up to a stated free cover limit. In the SME schemes we reviewed the limit is S$200,000 for term life. '
                                  "Above roughly 50 employees the insurer prices a customised plan on the group's own data."),
                                 ('What happens when an employee leaves?',
                                  'Cover ends on the last day of service unless the policy includes a conversion option, which lets the employee buy an '
                                  'individual policy without medical evidence within a set period, or the employer runs TMIS, which keeps hospital cover for '
                                  'up to 12 months after departure. Ask for both clauses when the plan is placed.'),
                                 ('How does this sit with CPF and statutory benefits?',
                                  'CPF, work injury compensation and Employment Act leave are the statutory floor; the insured programme sits above them. '
                                  'Eligible employees already get 14 days of paid outpatient sick leave and 60 days of paid hospitalisation leave after three '
                                  'months of service. The insured plan pays the hospital bill and the lump sums that the statutory layer does not.')],
                        'sources': [('IRAS: tax treatment of business expenses, insurance premiums',
                                     'https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(g-l)'),
                                    ('IRAS: tax treatment of business expenses, medical expenses',
                                     'https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(m-r)'),
                                    ('MOM: portable medical benefits for employees',
                                     'https://www.mom.gov.sg/employment-practices/schemes-for-employers-and-employees/portable-medical-benefits'),
                                    ('MOM: sick leave eligibility and entitlement',
                                     'https://www.mom.gov.sg/employment-practices/leave/sick-leave/eligibility-and-entitlement')],
                        'competitors': ['howdengroup.com/sg-en/comprehensive-guide-to-employee-benefits',
                                        'greateasternlife.com/sg/en/corporate-solutions/employee-benefits/group-insurance.html',
                                        'uob.com.sg/business/insure/employee-benefits-insurance.page']},
 'employees/group-travel': {'title': 'Group Business Travel Insurance Singapore | TRS',
                            'description': 'Group business travel insurance in Singapore: annual unnamed cover for staff trips, overseas medical and '
                                           'evacuation limits, and trip length rules.',
                            'intro': ['Group business travel insurance is an annual policy that covers every employee the company sends overseas, without '
                                      'naming them in advance. It pays overseas medical bills, emergency evacuation and repatriation, trip cancellation, '
                                      'delays, lost equipment and personal liability while the employee is travelling for work. Singapore companies buy it '
                                      'when staff start flying regionally, when a client or parent company asks for it, or after one uninsured hospital bill '
                                      'abroad. It is bought by firms from two employees upwards.',
                                      'It is not work injury compensation: an accident on an overseas assignment is already a WICA claim, with medical '
                                      'expenses capped at S$53,000. Travel cover adds illness, evacuation and the non-medical losses. The policy is unnamed, '
                                      'priced per traveller or on declared trip days, with a maximum trip length, a regional or worldwide territory, and a '
                                      'personal deviation allowance for leisure days around a trip. The broker sets the territory, limits and leisure '
                                      'extension, and handles emergency assistance and claims.'],
                            'who': ['Regional sales and service teams travelling to ASEAN, India and China every month',
                                    'Project and engineering firms sending staff on site assignments of weeks at a time',
                                    'Head offices whose directors and C-suite travel worldwide, including the USA and Canada',
                                    'Firms whose client contracts require insured, evacuation-ready travellers',
                                    'Companies with staff over 70, where individual travel policies decline or load',
                                    'Employers sending staff to locations without hospitals able to treat serious injury'],
                            'price': [('Territory', 'Worldwide including the USA and Canada is rated above a regional Asia-Pacific scope.'),
                                      ('Medical and evacuation limits',
                                       'Moving overseas medical from S$250,000 to S$600,000 adds premium; evacuation is usually unlimited.'),
                                      ('Trip volume',
                                       'Premium is per traveller for frequent flyers, or per trip-day for occasional travel declared at year end.'),
                                      ('Pre-existing condition rider',
                                       'Extending cover to known conditions adds a per-head loading but removes the most common declined claim.'),
                                      ('Occupation',
                                       'Office-based travellers are standard; site, offshore or security work moves the risk to a different class.'),
                                      ('Leisure extension',
                                       'Covering personal days around a trip, or pure leisure travel for executives, adds premium or is included for C-suite '
                                       'only.')],
                            'file': ['Estimated number of travellers and trips per year by region',
                                     'Longest expected trip and any assignments above 90 days',
                                     'Occupations and activities undertaken on trips',
                                     'Age profile of frequent travellers',
                                     'Current travel policy and claims for the past three years',
                                     'Whether leisure days or accompanying family should be included'],
                            'pitfalls': [('Relying on personal cards or individual policies',
                                          'Card cover often needs the fare paid on the card and stops at modest medical limits; individual policies are bought '
                                          'trip by trip and missed. An annual unnamed group policy covers every trip automatically and the finance team buys '
                                          'nothing per trip.'),
                                         ('Exceeding the trip length',
                                          'Policies cap each business trip, 183 days in the wording we reviewed, and cover stops on day 184. Flag any '
                                          'assignment above the cap before departure so the broker can arrange an extension or an expatriate medical plan.'),
                                         ('Undeclared pre-existing conditions',
                                          'Most wordings exclude pre-existing conditions unless a rider is bought, and a cardiac event abroad becomes an '
                                          'uninsured S$100,000 bill. Buy the rider for the whole group, or choose a wording that covers pre-existing '
                                          'conditions as standard.')],
                            'faqs': [('Is business travel insurance compulsory in Singapore?',
                                      'No law requires it. MOM requires work injury compensation insurance, which does respond to an accident on an overseas '
                                      'assignment, but only on the WICA scale and only for accidents, not illness. Travel cover is bought because a hospital '
                                      'stay or evacuation abroad can exceed those limits several times over, and because clients and parent companies ask for '
                                      'proof.'),
                                     ('How long can a single trip last?',
                                      'Wordings set a maximum per trip; the Singapore product we reviewed allows 183 days, inclusive of up to 31 days of '
                                      'personal deviation before, during or after the business trip. Trips of inter-city travel over 50 km count as business '
                                      'trips. Assignments longer than the cap need an extension or an expatriate plan.'),
                                     ('Does it cover leisure days on a work trip?',
                                      'Usually yes, up to a stated number of days, 31 in the wording reviewed, when they are attached to a business trip. Pure '
                                      'leisure travel for C-suite staff is included as an extension in some products at no extra premium; for other employees '
                                      'it is an optional add-on priced per head.'),
                                     ('What if an employee falls ill abroad?',
                                      'The policy pays overseas medical expenses up to the plan limit, commonly S$100,000 to S$600,000 per person, and '
                                      "emergency medical evacuation and repatriation, usually without limit, arranged through the insurer's 24-hour assistance "
                                      'line. Post-trip medical expenses in Singapore are covered up to a separate sub-limit. Call assistance first; direct '
                                      'admission without a guarantee of payment slows the claim.'),
                                     ('Are pre-existing conditions covered?',
                                      'Standard wordings exclude them. Insurers offer a pre-existing condition rider that extends overseas medical and '
                                      'evacuation to known conditions, and some corporate products include pre-existing conditions without a rider. For a '
                                      'group with older or frequent travellers the rider is the single most useful extension.'),
                                     ('Who is eligible and how small can the group be?',
                                      'Products in Singapore enrol from two employees on an unnamed basis, with insured persons aged 16 to 70 at entry and '
                                      'renewable to 75 in the wording we reviewed; some products cover beyond 80 at reduced sums. The insured must be resident '
                                      'in Singapore. The company declares headcount or trip days and the insurer adjusts at renewal.')],
                            'sources': [('MOM: who is covered under WICA, including overseas assignments',
                                         'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/who-is-covered'),
                                        ('MOM: types of compensation under WICA',
                                         'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation'),
                                        ('Chubb Singapore: Group Business Travel Enhanced factsheet (PDF)',
                                         'https://www.chubb.com/content/dam/chubb-sites/chubb-com/sg-en/customer-service-pdfs/group-business-travel-enhanced-factsheet.pdf')],
                            'competitors': ['dbs.com.sg/sme/services-insurance-and-advisory/insurance/group-business-travel-insurance',
                                            'chubb.com/content/dam/chubb-sites/chubb-com/sg-en/customer-service-pdfs/group-business-travel-enhanced-factsheet.pdf',
                                            'aig.sg/content/dam/aig/apac/singapore/documents/other/corporate-first-product-profile.pdf']},
 'employees/keyman': {'title': 'Keyman Insurance Singapore | TRS',
                      'description': 'Keyman insurance in Singapore: life or disability cover a company holds on a key person, the IRAS conditions for '
                                     'deducting premiums and payout tax.',
                      'intro': ['Keyman insurance is a life, total permanent disability or critical illness policy that a company buys on a founder, director '
                                'or rainmaker, with the company as owner and beneficiary. The payout replaces lost profit, funds a replacement hire or settles '
                                'debt while the business recovers. In Singapore the purchase is usually forced by a bank that wants the guarantor of a loan '
                                "insured, by an investor term sheet, or by a shareholders' agreement that needs cash to buy out a deceased partner's shares.",
                                'It is not an employee benefit; the key person and the family receive nothing from the policy. The cover is a term policy with '
                                'a fixed sum assured and term, renewable yearly or level for a fixed term, with no cash or investment value if the premium is '
                                'to be tax-deductible. Sizing follows the profit attributable to the person, the loan balance, or the agreed share value. The '
                                'broker obtains quotes across life insurers, manages the medical underwriting, and documents the basis for the sum assured for '
                                'the tax computation.'],
                      'who': ['Founder-led SMEs where one person brings in most of the revenue',
                              'Borrowers whose bank requires cover on the director who guarantees the facility',
                              'Partnerships and multi-shareholder companies funding a buy-sell agreement',
                              'Technology and professional firms built around one technical lead or licence holder',
                              'Companies with an investor term sheet that requires key person cover',
                              'Family businesses planning succession across a generation'],
                      'price': [('Age and health of the key person',
                                 'Premium rises with age and any loading from the medical; a non-smoker rate is markedly lower.'),
                                ('Sum assured',
                                 'The sum is set from attributable profit, loan balance or share value; a higher sum raises premium in proportion.'),
                                ('Term and renewability',
                                 'A level 10-year term costs more each year at the start than a yearly renewable policy but does not rise with age.'),
                                ('Benefits included',
                                 'Adding total permanent disability or critical illness to the death benefit adds premium and underwriting.'),
                                ('Occupation and travel', 'Hazardous occupations or frequent travel to high-risk countries attract a loading or an exclusion.'),
                                ('Policy type', 'A policy with cash value costs far more and fails the IRAS test; a pure term policy is the standard choice.')],
                      'file': ['Name, date of birth and role of the key person, with a signed consent',
                               'Basis of the sum assured: attributable profit, loan agreement or share valuation',
                               'Last two years of audited accounts',
                               "Shareholding structure and any buy-sell or shareholders' agreement",
                               'Bank facility letter if the lender requires the cover',
                               'Health declaration and any existing life cover on the person'],
                      'pitfalls': [('Buying a policy with cash value',
                                    'An endowment or investment-linked policy is not deductible under the IRAS guide, whatever it is labelled, because the '
                                    'business receives a payout even if nothing happens to the key person. Buy a pure term policy and keep the investment '
                                    'decision separate.'),
                                   ('Setting the sum above annual profits',
                                    'IRAS states that where the capital sum assured exceeds the annual profits of the business, the premiums are not '
                                    'deductible. Document the profit attributable to the person and size the sum from it; use a separate, non-deductible '
                                    'policy for a loan or share buyout.'),
                                   ('Assuming a bank-required policy is deductible',
                                    'A policy assigned to a lender protects the loan, not the profit stream, and the IRAS test looks at purpose and ownership. '
                                    'Treat the premium as non-deductible unless your tax adviser confirms otherwise, and keep the payout tax position clear in '
                                    'the loan planning.')],
                      'faqs': [('Are keyman insurance premiums tax-deductible in Singapore?',
                                "Only if all five IRAS conditions are met: the purpose is to insure against loss of profits from the key person's death or "
                                'disability; the sum insured relates directly to the annual profits attributable to that person; the policy stays the property '
                                'of the business with no assignment to the insured or family; it has no cash surrender or investment value; and the loss would '
                                'not destroy the entire profit-making structure. The guide is in its third edition, published 30 January 2026.'),
                               ('Is the payout taxable?',
                                'Where the premiums qualified for deduction, IRAS treats any recovery under the policy as a trading receipt and taxes it. '
                                'Where the premiums were not deductible, because the policy protects capital rather than profit, the proceeds are capital in '
                                'nature. Decide the treatment when the policy is bought, not at claim, and record it in the tax computation.'),
                               ('Can a sole proprietor or majority shareholder be the key person?',
                                'A sole proprietor is denied a deduction for cover on their own life, because the business is not separate from them. A '
                                'company whose key person owns a substantial share, alone or with relatives, may also be refused where the facts show the '
                                'benefit accrues to that person personally. The policy can still be bought; only the deduction is at risk.'),
                               ('How much cover should the company buy?',
                                'For a deductible policy, a sum tied to the profit the person generates; IRAS states the premiums are not deductible where the '
                                'sum exceeds the annual profits of the business. For a loan, the outstanding balance over the facility term. For a buy-sell '
                                'agreement, the agreed value of the shares. Many companies hold two policies to keep the tax positions separate.'),
                               ('Who owns the policy and who gets paid?',
                                'The company applies, pays the premium, owns the policy and receives the proceeds. The key person signs a consent to be '
                                "insured and completes the medical. If the person leaves, the company can keep the policy, lapse it or, with the insurer's "
                                'agreement, transfer it to the individual; a transfer is an assignment and ends any deduction from that date.'),
                               ('What must I file with IRAS?',
                                'Nothing with the return. The basis for treating the person as a key person must be stated in the tax computation, and the '
                                'supporting documents, policy, accounts and attribution workings, kept for production on request. A short memo at purchase '
                                'that sets out role, attributable profit and the sum assured is usually enough.')],
                      'sources': [('IRAS e-Tax Guide: Deductibility of Keyman Insurance Premiums, third edition (PDF)',
                                   'https://www.iras.gov.sg/media/docs/default-source/e-tax/deductibility-of-keyman-insurance-premiums.pdf'),
                                  ('IRAS: tax treatment of business expenses, insurance premiums',
                                   'https://www.iras.gov.sg/taxes/corporate-income-tax/income-deductions-for-companies/business-expenses/tax-treatment-of-business-expenses-(g-l)')],
                      'competitors': ['ocbc.com/business-banking/smes/insurance/keyman-insurance',
                                      'thekopinotes.com/glossary/key-man-insurance-singapore/',
                                      'sc.com/sg/business-insurance/business-protection-insurance/keyman-protection/']},
 'employees/dao': {'title': 'D&O Insurance Singapore for Private Companies | TRS',
                   'description': 'D&O insurance in Singapore for private companies: what the Companies Act lets a company insure for its officers, Side A and '
                                  'B, and run-off.',
                   'intro': ['Directors and officers (D&O) insurance pays the defence costs, settlements and awards a director or officer faces personally for '
                             'a wrongful act in managing the company: a breach of duty, a misstatement, an employment claim, a regulatory investigation. '
                             'Private companies in Singapore buy it when an investor joins the board, when a lender or customer asks, when a subsidiary '
                             'director is appointed overseas, or after a dispute between shareholders. The Companies Act voids most indemnities the company '
                             'could give instead, so insurance is the usual route.',
                             "It is not professional indemnity for the firm's services and it does not pay fines where the law prohibits it. The policy is "
                             'claims-made: it responds to claims first made during the policy year, for acts after the retroactive date. It is bought with an '
                             'aggregate limit shared by all insureds, a retention that applies to company reimbursement but usually not to individuals, and a '
                             'run-off option that extends reporting after a sale or liquidation. The broker sets the limit, negotiates the conduct and '
                             'insured-versus-insured wording and manages notifications.'],
                   'who': ['Venture-backed companies whose term sheet requires D&O cover for investor directors',
                           'Private companies with external, nominee or independent directors',
                           'Regional holding companies appointing directors to overseas subsidiaries',
                           'Firms in a shareholder dispute or a change of control',
                           'Companies employing more than 50 staff, where employment claims are the most frequent trigger',
                           'Not-for-profits, societies and charities with volunteer boards'],
                   'price': [('Limit of liability', 'Private company programmes run from S$500,000 to S$5 million; each step up adds premium.'),
                             ('Revenue and asset size',
                              'Insurers band private companies by turnover or total assets, with simplified quotes below set thresholds.'),
                             ('Financial position', 'Losses, thin equity or covenant pressure raise the insolvency exposure and the rate.'),
                             ('Shareholder structure', 'Outside investors, disputes and a planned IPO or sale add claim likelihood.'),
                             ('Employment practices cover',
                              'Including EPL, usually at a sub-limit, adds premium and brings the most frequent claims into the policy.'),
                             ('Overseas exposure', 'Subsidiaries and directorships in the USA or in regulated sectors carry higher rates.')],
                   'file': ['Latest audited accounts and current management accounts',
                            'Group structure with every entity and directorship to be insured',
                            "Shareholder register and any shareholders' agreement",
                            'Headcount and any employment disputes in the past five years',
                            'Any claims, investigations or circumstances known to the board',
                            'Planned transactions: fundraising, sale, listing, restructuring'],
                   'pitfalls': [('Relying on an indemnity in the constitution',
                                 'Section 172 of the Companies Act makes void any provision that exempts or indemnifies an officer against liability for '
                                 'negligence, default, breach of duty or breach of trust to the company. Section 172A lets the company buy and maintain '
                                 'insurance for that liability instead, so place the policy rather than rely on the clause.'),
                                ('Letting the retroactive date move',
                                 'Switching insurer with a new retroactive date drops cover for every act before it. Keep continuity of the retroactive date '
                                 'in writing at each renewal and notify known circumstances before the old policy expires.'),
                                ('No run-off after a sale',
                                 'When the company is sold or wound up the policy ends and the former directors have no cover for claims made later. Buy '
                                 'run-off at completion; the cost is a one-off premium and the reporting period should outlast the limitation period for '
                                 'claims.')],
                   'faqs': [('Is D&O insurance compulsory for a Singapore private company?',
                             'No. The Companies Act does not require it, but section 172A expressly permits a company to purchase and maintain insurance for '
                             'an officer against liability that section 172 forbids the company to indemnify. Investor term sheets, lender covenants and '
                             'customer contracts frequently require it, which is why most private companies with outside shareholders hold a policy.'),
                            ('What are Side A, B and C?',
                             'Side A pays the individual director directly where the company cannot or will not indemnify, for example in insolvency; it '
                             'usually carries no retention. Side B reimburses the company for the indemnity it is permitted to pay. Side C covers the company '
                             'itself for securities claims and matters mainly for listed companies. Private companies buy A and B; C is added before a '
                             'listing.'),
                            ('What does a private company D&O policy exclude?',
                             'Dishonest or fraudulent conduct, usually only once established by final judgment or admission; claims pending or litigation '
                             'known before the policy; claims by one insured against another, with carve-backs; bodily injury and property damage; and public '
                             'offerings unless endorsed. Fines and penalties are paid only where the law allows. Read the conduct and insured-versus-insured '
                             'clauses before binding.'),
                            ('Does it cover regulatory investigations?',
                             'Yes, where the wording defines investigation to include an officer named in writing by a regulator, including as a witness. The '
                             'policy pays legal representation costs for attendance before ACRA, MAS, MOM, PDPC or the police, and some wordings include '
                             'pre-investigation costs for an internal inquiry that leads to a self-report. Fines imposed on the individual are covered only '
                             'where insurable at law.'),
                            ('Are employment claims included?',
                             'Often, as an employment practices liability extension with its own sub-limit, S$1 million in one Singapore product. It covers '
                             'wrongful dismissal, discrimination and harassment claims against the company and its officers. For a private company this is the '
                             'most frequent claim type, so price the extension at every renewal.'),
                            ('What limit should a private company buy?',
                             'Singapore products for private companies quote from S$500,000 to S$2 million on simplified terms by revenue band, and up to S$5 '
                             'million on full underwriting below set asset thresholds. The limit is shared by every insured person and by defence costs, so a '
                             'company with several outside directors or an overseas subsidiary needs more than a founder-only board.')],
                   'sources': [('Companies Act 1967, section 172: provisions protecting officers from liability',
                                'https://sso.agc.gov.sg/Act/CoA1967?ProvIds=pr172-'),
                               ('Companies Act 1967, section 172A: provision of insurance', 'https://sso.agc.gov.sg/Act/CoA1967?ProvIds=pr172A-'),
                               ('Chubb Singapore: Elite VI Directors and Officers Liability factsheet (PDF)',
                                'https://www.dbs.com.sg/sme/directors-and-officers-insurance/elite-vi-directors-officers-liability-factsheet-sg.pdf')],
                   'competitors': ['aig.sg/business/business-products-and-services/financial-lines/directors-and-officers-liability',
                                   'dbs.com.sg/sme/services-insurance-and-advisory/insurance/directors-and-officers-insurance',
                                   'rafflescorporateservices.com/directors-and-officers-do-liability-insurance-singapore-2026/']},
 'personal/fire': {'title': 'Fire Insurance Singapore | TRS',
                   'description': 'Fire insurance Singapore: HDB loan flats must hold the Etiqa HDB scheme policy, renewed every 5 years; bank mortgages need '
                                  'a mortgagee interest policy.',
                   'intro': ['Fire insurance pays to reinstate the structure of a home after fire and the other perils listed in the policy, such as '
                             'lightning, explosion and burst pipes. Two rules force the purchase in Singapore. HDB flat owners with an HDB loan that started '
                             'on or after 1 September 1994 must hold the HDB Fire Insurance Scheme policy, underwritten by Etiqa since 16 August 2024, for as '
                             'long as the loan runs. Banks require a mortgagee interest policy on every private property and bank-financed flat they lend '
                             'against.',
                             'Fire insurance is not home contents insurance. It excludes renovations, furniture, appliances and personal belongings, and the '
                             'HDB scheme also excludes alternative accommodation and liability to neighbours. The sum insured is the cost to rebuild the '
                             'structure, not the market value; a bank may set it at the outstanding loan instead. The HDB policy runs 5 years and most bank '
                             'policies 1 year. TRS checks the sum insured against reinstatement cost, names the bank as mortgagee and adds the '
                             'non-cancellation clause the lender asks for.'],
                   'who': ['HDB flat owners with an HDB loan that started on or after 1 September 1994.',
                           'Private property owners whose bank requires a mortgagee interest policy before drawdown.',
                           'HDB owners on a bank loan, where the bank sets its own fire cover condition.',
                           'Owners who have repaid the loan and want structure cover to continue.',
                           "Landlords insuring the structure of a leased unit separately from the tenant's contents."],
                   'price': [('Flat type', 'HDB scheme premiums are fixed by flat type, from S$1.11 to S$6.68 for 5 years including GST.'),
                             ('Reinstatement cost',
                              'Bank policies price on the cost to rebuild; a higher valuation or a revaluation raises the sum insured and the premium.'),
                             ('Property type',
                              'Strata apartments are insured at the lower of reinstatement value or outstanding loan; landed homes at full reinstatement value '
                              'excluding land.'),
                             ('Perils added', 'Extending the base fire cover to burst pipes, flood or impact widens the policy and moves the rate.'),
                             ('Who arranges it',
                              "A bank-arranged policy is priced by the bank's panel insurer; an owner-arranged policy must still name the bank as mortgagee "
                              'and may carry a bank administration fee.')],
                   'file': ['HDB scheme account number, or postal code and unit number',
                            'Bank letter of offer stating the fire insurance condition',
                            'Latest valuation report or reinstatement cost estimate',
                            'Property type, floor area and year of completion',
                            'Existing fire or mortgagee policy and its expiry date',
                            'Name of the mortgagee bank to be endorsed on the policy'],
                   'pitfalls': [('Letting the HDB policy lapse',
                                 'The HDB scheme does not renew itself and cannot be paid from CPF. Diarise the 5-year expiry and pay the cash premium online '
                                 'or at an AXS kiosk before it ends.'),
                                ('Insuring at loan balance only',
                                 'A sum insured set at the outstanding loan protects the bank, not the owner, and leaves the rebuild short once the loan has '
                                 'been paid down. Insure at full reinstatement cost and review it after each revaluation.'),
                                ('Treating fire cover as home insurance',
                                 'Neither the HDB policy nor a bank mortgagee policy pays for renovations, contents or a hotel while the flat is repaired. Add '
                                 'a home contents policy that covers renovation works at their invoice cost.')],
                   'faqs': [('Is HDB fire insurance compulsory?',
                             'Yes, if the flat has an HDB housing loan that started on or after 1 September 1994. The policy must be bought and renewed every '
                             '5 years until the loan is repaid. Owners on a bank loan or with no loan are not required to hold it, but may buy it. The '
                             'appointed insurer since 16 August 2024 is Etiqa. The premium is paid in cash, not from the CPF Ordinary Account.'),
                            ('What does the HDB fire insurance policy cover?',
                             'It pays to reinstate the internal structure, fixtures and fittings originally provided by HDB or its approved developers after '
                             'fire and the listed extraneous perils, including fire spreading from an adjoining unit and water from burst pipes. Sums insured '
                             'run from S$37,900 for a 1-room flat to S$176,700 for an Executive flat. It does not cover renovations, furniture, personal '
                             'belongings, alternative accommodation or liability to neighbours.'),
                            ('What does a bank mean by a mortgagee interest policy?',
                             'A fire policy on the mortgaged property with the bank named as mortgagee. If damage stops the borrower servicing the loan, the '
                             'bank claims against the insurer and the borrower stays liable for the balance. Banks set the sum insured at reinstatement cost, '
                             'or for strata apartments at the lower of reinstatement cost and the outstanding loan. The policy must carry a clause requiring '
                             'the insurer to notify the bank before cancellation.'),
                            ("Can I buy fire insurance from my own insurer instead of the bank's panel?",
                             "Usually yes, with the bank's approval. The policy must name the bank as mortgagee, include a non-cancellation clause and reach "
                             'the bank before the current cover expires; Standard Chartered asks for the documents 5 business days ahead and charges a S$100 '
                             "administration fee a year. If the owner's policy lapses, the bank arranges cover itself. HDB loan flats have no choice: the "
                             'scheme policy must come from Etiqa.'),
                            ('Does the MCST fire policy on my condominium cover my unit?',
                             'The MCST policy insures the building and common property on behalf of all owners. The bank still requires a mortgagee interest '
                             "policy on the unit, because the two policies protect different interests: the strata body on one side, the lender's charge over "
                             'the unit on the other. Renovations and contents inside the unit fall under neither and need a home contents policy.'),
                            ('What happens if I do not renew the HDB fire insurance?',
                             'The flat is uninsured for structural damage and the condition attached to the HDB loan is no longer met. HDB sends a renewal '
                             'notice before expiry, but renewal is not automatic. Reinstate the policy through Etiqa online, the AXS app or an AXS kiosk, '
                             'using the HDB scheme account number or the postal code and unit number. The new policy runs 5 years from its own start date.')],
                   'sources': [('CPF Board, insurance for your HDB flat',
                                'https://www.cpf.gov.sg/member/infohub/educational-resources/protect-your-home-insurance-for-your-hdb-flat'),
                               ('Etiqa, HDB Fire Insurance Scheme', 'https://www.etiqa.com.sg/personal/fire-insurance/'),
                               ('GIA, is HDB or bank fire insurance enough',
                                'https://gia.org.sg/property-insurance-faq/395-having-the-hdb-fire-insurance-or-policy-arranged-by-my-bank-is-good-enough.html'),
                               ('Standard Chartered, mortgage fire insurance requirements', 'https://www.sc.com/sg/help/mortgage/')],
                   'competitors': ['etiqa.com.sg/personal/fire-insurance/', 'msig.com.sg/node/1956', 'dollarbureau.com/blog/hdb-fire-insurance/']},
 'personal/home-contents': {'title': 'Home Contents Insurance Singapore | TRS',
                            'description': 'Home contents insurance Singapore covers furniture, appliances, renovations and belongings that HDB fire and bank '
                                           'mortgagee policies leave out.',
                            'intro': ['Home contents insurance pays to repair or replace what is inside the home: furniture, appliances, electronics, clothing '
                                      'and the renovations the owner paid for. The perils are fire, lightning, explosion, burst pipes, flood, theft with '
                                      'forced entry and impact; all-risks plans add accidental damage. Owners buy it because the HDB Fire Insurance Scheme and '
                                      'bank mortgagee policies cover the structure only. Tenants buy it for their own belongings and their liability to the '
                                      'landlord. Landlords buy it for the fittings they leave in a leased unit.',
                                      'It is not fire insurance on the structure and does not replace the HDB or bank policy. Cover is bought for one year on '
                                      'a sum insured for contents, a separate sum for renovations and a liability limit, with an excess per claim. Most '
                                      'Singapore plans pay new-for-old; some settle on a first-loss basis so a low sum insured is not penalised. TRS matches '
                                      "the renovation sum to the contractor's invoice, checks the sub-limits on valuables and electronics, and places the "
                                      'policy with the insurer whose wording fits the home.'],
                            'who': ['HDB and condominium owners whose fire policy stops at the HDB-provided structure.',
                                    'Owners who have completed a renovation and need the works insured at cost.',
                                    'Tenants insuring their own belongings and their liability to the landlord.',
                                    'Landlords insuring fittings and loss of rent on a leased unit.',
                                    'Households holding jewellery, watches, cameras or bicycles above the standard sub-limits.'],
                            'price': [('Sum insured for contents',
                                       'Plans run from S$35,000 to S$100,000 of contents on standard tiers; a higher figure raises the premium in step.'),
                                      ('Renovation sum',
                                       'Built-in carpentry, flooring and kitchens are insured at invoice cost; a S$100,000 renovation costs more to insure '
                                       'than a S$30,000 one.'),
                                      ('Insured perils or all-risks', 'An all-risks plan adds accidental damage and costs more than a named-perils plan.'),
                                      ('Valuables',
                                       'Jewellery and watches are capped per item, often 5% of the contents sum or a fixed figure, and specifying higher '
                                       'amounts adds premium.'),
                                      ('Liability limit', 'Family liability limits range from S$500,000 to S$5,000,000 between insurers and affect the price.'),
                                      ('Policy term', 'Some insurers discount 3-year terms against annual renewal.')],
                            'file': ['Address, property type and whether owner, tenant or landlord',
                                     'Renovation cost with the contractor invoice or quotation',
                                     'Estimated replacement value of contents',
                                     'List of items above the per-article sub-limit',
                                     'Claims or losses in the last 3 years',
                                     'Existing HDB fire or mortgagee policy details'],
                            'pitfalls': [('Under-insuring the contents',
                                          'On an average-clause policy, insuring S$40,000 of contents worth S$50,000 cuts every claim to 80%. Total the '
                                          'replacement cost room by room, or choose a first-loss plan that waives the condition.'),
                                         ('Leaving renovations out',
                                          'Fire insurance pays for the HDB-provided floor, not the marble laid over it. Insure renovations at invoice cost '
                                          'under their own section and update the sum after each new job.'),
                                         ('Missing the sub-limits',
                                          'A S$6,000 watch claimed on a plan with a S$2,500 per-article cap pays S$2,500. Declare valuables above the cap and '
                                          'have them listed on the schedule.')],
                            'faqs': [('I have HDB fire insurance. Do I still need home contents insurance?',
                                      'Yes, if the renovations, furniture and belongings matter. The HDB policy reinstates only the structure, fixtures and '
                                      "fittings HDB provided. CPF Board's guide to insuring an HDB flat recommends a separate contents policy for renovations, "
                                      'furniture and appliances, and notes that private policies can also meet debris removal and alternative living costs. '
                                      'The HDB policy pays none of these.'),
                                     ('What is the difference between insured perils and all-risks cover?',
                                      'An insured-perils plan pays only for the events listed: fire, lightning, explosion, burst pipes, flood, theft by '
                                      'forcible entry and impact. An all-risks plan pays for any sudden accidental loss not excluded, such as a dropped '
                                      'television. All-risks costs more and still excludes wear, gradual leaks, pests in the first 30 days on one wording, and '
                                      'homes left unoccupied for more than 60 consecutive days.'),
                                     ('How much should I insure my contents for?',
                                      'The cost to replace everything new today, room by room. Insurers settle new-for-old, so the figure is replacement cost, '
                                      'not resale value. Where the policy carries an average clause, under-insuring reduces every claim in the same '
                                      'proportion. Where it is first-loss, the sum is the largest single loss the household expects to claim and the average '
                                      'clause does not apply.'),
                                     ("Does home contents insurance cover my family's liability or my domestic helper?",
                                      'Most plans include family personal liability, from S$500,000 to S$5,000,000 depending on the insurer, for injury or '
                                      'property damage caused to others by the family and, on many wordings, by a domestic helper working in the home. Tenant '
                                      "plans add liability to the landlord for damage to the unit, up to S$500,000 on one wording. The helper's own medical "
                                      'and accident cover is a separate MOM-mandated maid policy.'),
                                     ('Are jewellery, laptops and bicycles covered?',
                                      'Yes, within sub-limits. One major insurer caps laptops and tablets at S$1,500 per item and S$5,000 in total, mobile '
                                      'phones at S$500 per item, bicycles at S$1,000, and valuables at 5% of the contents sum per item up to one-third of the '
                                      'sum in total. Another caps jewellery and watches at S$1,750 to S$5,000 per article by plan tier. Items above these must '
                                      'be declared and listed.'),
                                     ('Can a tenant buy home contents insurance?',
                                      'Yes. A tenant insures their own furniture, electronics and belongings, any renovation they paid for, and their '
                                      "liability to the landlord for damage to the unit. The landlord's structure and fittings stay on the landlord's policy. "
                                      'The cover moves with the tenant to a new address once the insurer is told, and the lease usually names the tenant as '
                                      "responsible for the landlord's property in their care.")],
                            'sources': [('CPF Board, insurance for your HDB flat',
                                         'https://www.cpf.gov.sg/member/infohub/educational-resources/protect-your-home-insurance-for-your-hdb-flat'),
                                        ('GIA, is HDB or bank fire insurance enough',
                                         'https://gia.org.sg/property-insurance-faq/395-having-the-hdb-fire-insurance-or-policy-arranged-by-my-bank-is-good-enough.html'),
                                        ('Income, Enhanced Home Insurance policy page and limits', 'https://www.income.com.sg/home-insurance'),
                                        ('Singlife, Home Insurance plan limits', 'https://singlife.com/en/insurance/home')],
                            'competitors': ['income.com.sg/home-insurance',
                                            'singlife.com/en/insurance/home',
                                            'aig.sg/personal/home-insurance',
                                            'hlas.com.sg/love-your-home-with-a-home-contents-insurance-cover/']},
 'personal/maid': {'title': 'Maid Insurance Singapore | TRS',
                   'description': 'Maid insurance Singapore: MOM requires S$60,000 medical cover, S$60,000 personal accident cover and a S$5,000 security bond '
                                  'before the helper arrives.',
                   'intro': ['Maid insurance is the package an employer of a migrant domestic worker must hold under Ministry of Manpower rules: medical '
                             'insurance of at least S$60,000 a year for inpatient care and day surgery, personal accident insurance with a sum assured of at '
                             'least S$60,000 payable to the helper or her beneficiaries, and a S$5,000 security bond for every helper who is not Malaysian. '
                             'All three must be in force before the helper arrives in Singapore, or she is not allowed to enter.',
                             "It is not health insurance for the employer's family and does not cover the helper's outpatient GP visits unless the plan adds "
                             'them. Policies are sold for 14 or 26 months to match 12 and 24 month work permits. Under the enhanced medical requirement, the '
                             'insurer pays 75% of hospital costs above S$15,000 and the employer 25%, unless a co-payment waiver is added. TRS compares the '
                             'hospital limit, the waiver, wage and repatriation benefits and the bond protector, then has the insurer issue the bond to MOM.'],
                   'who': ['First-time employers applying for a work permit for a helper.',
                           'Employers renewing a 2-year work permit, where the policy must restart with it.',
                           'Transfer employers taking over a helper already in Singapore.',
                           'Employers of helpers above 50, where age-banded premiums apply from 1 July 2025.',
                           'Employers who want hospital costs above the MOM minimum covered.'],
                   'price': [("Helper's age", 'Since 1 July 2025 MOM allows two premium bands, age 50 and below and above 50; the older band costs more.'),
                             ('Policy term', 'A 26-month policy for a 2-year permit costs less per month than two 14-month policies.'),
                             ('Hospital limit above the minimum', 'Raising the S$60,000 annual limit or buying a co-payment waiver adds premium.'),
                             ('Optional benefits',
                              'Wage reimbursement, repatriation, replacement helper costs and outpatient cover each add to the base rate.'),
                             ('Security bond protector',
                              "A rider that limits the employer's liability on a bond forfeiture, added within 30 days of the policy start on most plans, "
                              'carries its own premium.'),
                             ('Pre-existing conditions',
                              'Some insurers cover a helper who has worked in Singapore for more than 12 consecutive months; the wider wording costs more.')],
                   'file': ["Helper's passport, nationality and date of birth",
                            'Work permit application or renewal reference',
                            'Permit term: 12 or 24 months',
                            "Employer's NRIC and address",
                            'Arrival date, or current permit expiry for renewals',
                            'Existing policy to be replaced on transfer'],
                   'pitfalls': [('Buying after the helper lands',
                                 'MOM requires the medical, accident and bond cover to take effect on arrival, and the insurer needs up to 3 working days to '
                                 'transmit the bond to MOM. Buy at least a week before the flight and keep the MOM confirmation.'),
                                ('Stopping at the minimum',
                                 'A S$60,000 limit with 25% co-payment above S$15,000 leaves the employer paying thousands on a long admission, and the cost '
                                 'cannot be deducted from salary. Add the co-payment waiver or a higher hospital limit.'),
                                ('Forgetting the bond on renewal',
                                 'The security bond and both policies must run for the whole permit. Align the 26-month policy with the renewed permit date so '
                                 'no gap opens before MOM discharges the old bond.')],
                   'faqs': [('What insurance does MOM require for a domestic helper?',
                             'Three items. Medical insurance with an annual claim limit of at least S$60,000 covering inpatient care and day surgery, with the '
                             'insurer paying 75% and the employer 25% of costs above S$15,000. Personal accident insurance with a sum assured of at least '
                             'S$60,000, payable to the helper or her beneficiaries. A S$5,000 security bond for each helper who is not Malaysian. All must be '
                             'in force before she arrives.'),
                            ('What changed in the MOM medical insurance rules in 2023 and 2025?',
                             'From 1 July 2023 the minimum annual limit rose to S$60,000 with the 75/25 co-payment above S$15,000. From 1 July 2025 insurers '
                             'must use standardised exclusion clauses, may price in two age bands (50 and below, above 50) and must pay hospitals directly '
                             'once a claim is admissible. The rules apply to policies, renewals and extensions starting on or after each date.'),
                            ('What is the security bond and when do I get it back?',
                             'A S$5,000 guarantee to MOM for each non-Malaysian helper, usually issued by the insurer with the maid policy rather than paid in '
                             'cash. MOM may forfeit it if the employer or helper breaches work permit conditions, salary is paid late, the helper is not sent '
                             'home when the permit ends, or she goes missing. It is discharged about one week after she leaves Singapore, provided the permit '
                             'was cancelled and no condition was breached.'),
                            ('Why is the policy 14 or 26 months when the permit is 12 or 24?',
                             'Insurers add 2 months so cover runs through the period after the permit expires, when the helper may still be in Singapore '
                             'awaiting repatriation or transfer, and so the bond stays in force until MOM discharges it. The extra months are priced into the '
                             'plan at no separate premium. The 26-month policy is the usual match for a fresh or renewed 2-year permit.'),
                            ("Who pays the helper's medical bills above the insurance?",
                             "The employer. MOM holds employers responsible for the helper's medical needs and does not allow medical expenses to be deducted "
                             'from her salary. Above the S$60,000 annual limit, and for the 25% co-payment on costs above S$15,000, the employer pays unless '
                             "the policy has a co-payment waiver or a higher limit. Outpatient GP visits are the employer's cost unless the plan includes an "
                             'outpatient benefit.'),
                            ('Does the cover apply on her rest day or outside the home?',
                             'Personal accident cover under MOM rules responds to sudden accidents causing death or permanent disability, and the policy may '
                             'not carry exclusions beyond those in the Employment of Foreign Manpower Regulations. Hospital cover applies to admissions in '
                             'Singapore. Every helper has at least one rest day a month that cannot be compensated away, since 1 January 2023; check the '
                             'wording for injuries away from the home on that day before buying.')],
                   'sources': [('MOM, insurance requirements for migrant domestic workers',
                                'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-domestic-worker/eligibility-and-requirements/insurance-requirements'),
                               ('MOM, security bond',
                                'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-domestic-worker/eligibility-and-requirements/security-bond'),
                               ('MOM, mandatory rest days from 1 January 2023',
                                'https://www.mom.gov.sg/newsroom/press-releases/2022/1007-mandatory-rest-days-for-mdws'),
                               ('Income, Domestic Helper Insurance policy page', 'https://www.income.com.sg/domestic-helper-insurance')],
                   'competitors': ['income.com.sg/domestic-helper-insurance',
                                   'income.com.sg/blog/faqs-maid-insurance-singapore',
                                   'msig.com.sg/node/1981',
                                   'dollarsandsense.sg/guide-buying-maid-insurance-singapore/']},
 'personal/personal-accident': {'title': 'Personal Accident Insurance Singapore | TRS',
                                'description': 'Personal accident insurance Singapore pays a lump sum on accidental death or disablement and reimburses clinic '
                                               'bills without a hospital stay.',
                                'intro': ['Personal accident insurance pays a fixed lump sum if an accident causes death or permanent disablement, and '
                                          'reimburses medical bills from an accident: clinic visits, X-rays, physiotherapy and, on many plans, Traditional '
                                          'Chinese Medicine. It pays on the event, not on proof of lost income. Singapore residents buy it because MediShield '
                                          'Life and Integrated Shield Plans are built around hospital admissions, so an outpatient fracture or a ligament '
                                          'repair in a day clinic falls outside them. Self-employed people, delivery riders and sports players buy it most.',
                                          'It is not life insurance and not health insurance: illness is excluded unless the plan adds named infectious '
                                          'diseases such as dengue, and pre-existing conditions are excluded. Cover is bought for one year on a sum insured, a '
                                          'medical reimbursement limit per accident and optional weekly or daily cash benefits. Premiums follow occupation '
                                          'class rather than age on most plans. TRS checks the disablement scale, the activity exclusions and the claim '
                                          "deadline, and places the cover with the insurer whose wording fits the buyer's work and sport."],
                                'who': ['Self-employed people and gig workers with no employer medical or work injury cover.',
                                        'Employees whose company plan stops at hospitalisation and excludes outpatient treatment.',
                                        'Families insuring children against playground, cycling and sports injuries.',
                                        'Motorcyclists, climbers and divers whose activities need an explicit extension.',
                                        'Retirees who have lost employer cover and want accident cover without medical underwriting.'],
                                'price': [('Occupation class',
                                           'Office work is class 1; manual, outdoor or height work is rated higher and some trades are declined.'),
                                          ('Sum insured',
                                           'The lump sum for death or permanent disablement, from S$100,000 to S$1,000,000 on current plans, sets the base '
                                           'rate.'),
                                          ('Medical reimbursement limit',
                                           'A S$3,000 per-accident limit costs more than S$1,000; adding TCM and physiotherapy adds further.'),
                                          ('Weekly or daily benefits',
                                           'Temporary disablement income, such as S$200 a week for up to 104 weeks, and hospital cash are priced add-ons.'),
                                          ('Activities', 'Motorcycling, aerial sports and diving below 40 metres are excluded or loaded.'),
                                          ('Family cover',
                                           'Spouse discounts of 10% and free child cover up to a share of the adult sum reduce the per-person cost.')],
                                'file': ['Occupation and a one-line description of duties',
                                         'Age and residency status of each person insured',
                                         'Sum insured and medical limit wanted',
                                         'Sports or activities practised regularly',
                                         'Existing accident, health or employer cover',
                                         'Accident claims in the last 3 years'],
                                'pitfalls': [('Assuming illness is covered',
                                              'A personal accident plan pays for accidents; dengue, HFMD and COVID-19 are covered only where named, and often '
                                              'after a waiting period of 14 days or more from policy start. Read the infectious disease schedule before '
                                              'relying on it.'),
                                             ('Wrong occupation class',
                                              'A rider declared as an office worker is rated at the wrong class, and the insurer can reject or reduce the '
                                              'claim. State the real job and tell the insurer when it changes.'),
                                             ('Claiming late',
                                              'Policies set a notification window, commonly 30 days from the accident, and want original receipts and the '
                                              'medical report. Report the accident at once and keep every bill.')],
                                'faqs': [('What does personal accident insurance pay for?',
                                          'A lump sum on accidental death, a percentage of the sum insured on permanent disablement according to a scale in '
                                          'the policy, and reimbursement of medical costs from an accident up to a per-accident limit. Many plans add weekly '
                                          'cash during temporary disablement, daily hospital cash and named infectious diseases. Payment does not depend on a '
                                          'hospital stay, which is the gap it fills next to MediShield Life.'),
                                         ('How is this different from my Integrated Shield Plan?',
                                          'An Integrated Shield Plan reimburses hospital and day-surgery bills, after a deductible and co-insurance, and does '
                                          'not pay for most outpatient clinic, physiotherapy or TCM treatment. A personal accident plan pays a fixed sum on '
                                          'death or disablement regardless of bills, and reimburses outpatient accident treatment. The two overlap only on an '
                                          'accident that leads to admission, where both can respond.'),
                                         ('Does it cover dengue or COVID-19?',
                                          'Only where the plan names the disease. Several Singapore insurers list dengue and 20 or more other infectious '
                                          'diseases as a benefit with a fixed payout or medical reimbursement, usually after a waiting period from policy '
                                          'start; one insurer applies 14 days for COVID-19 cover on selected plans. Illness outside the named list is excluded '
                                          'on every personal accident plan.'),
                                         ('Will it pay if I am injured riding a motorcycle or playing sport?',
                                          'Recreational sport open to the public is normally covered. Common exclusions are aerial activities, underwater '
                                          'activities below 40 metres, racing, speed or time trials and any sport for financial reward. Motorcycling is '
                                          'excluded or loaded on some plans and covered on others. Declare the activity before buying and get the extension in '
                                          'writing; an undeclared risk is the usual reason a claim is reduced.'),
                                         ('What is an occupation class and why does it change my premium?',
                                          'Insurers group jobs by accident frequency. Class 1 is indoor office work; higher classes cover sales staff on the '
                                          'road, technicians, drivers, construction and offshore trades. The premium for the same sum insured rises with the '
                                          'class, and a few trades are declined. The class on the schedule must match the actual job, or the insurer can '
                                          'reduce the claim in proportion to the premium underpaid.'),
                                         ('How do I claim, and what if the insurer refuses?',
                                          'Notify the insurer within the policy deadline, commonly 30 days, and submit the claim form, medical report and '
                                          'original receipts; one insurer acknowledges within 3 working days and pays approved claims by PayNow within 3 '
                                          'business days. If the claim is rejected, FIDReC adjudicates disputes up to S$150,000 per claim at no charge to the '
                                          "consumer, provided the complaint is filed within 6 months of the insurer's final reply.")],
                                'sources': [('FIDReC, jurisdiction and claim limits', 'https://www.fidrec.com.sg/knowledgebase/article/KA-01131'),
                                            ("SDIC, Policy Owners' Protection Scheme scope", 'https://www.sdic.org.sg/pp_scope_of_coverage/'),
                                            ('Singlife, Personal Accident policy page', 'https://singlife.com/en/insurance/personal-accident')],
                                'competitors': ['singlife.com/en/insurance/personal-accident',
                                                'income.com.sg/personal-accident-insurance',
                                                'dollarbureau.com/blog/personal-accident-insurance-singapore/',
                                                'singsaver.com.sg/travel-insurance/blog/best-personal-accident-insurance-singapore']},
 'consumers/motor': {'title': 'Motor Insurance Singapore | TRS',
                     'description': 'Motor insurance Singapore: third-party injury cover is required by law and for road tax, NCD runs 10% to 50%, accidents '
                                    'are reported within 24 hours.',
                     'intro': ["Motor insurance covers the owner's legal liability to other road users and, on wider plans, the car itself. The Motor Vehicles "
                               '(Third-Party Risks and Compensation) Act makes it an offence to use a vehicle in Singapore without a policy covering death or '
                               "bodily injury to third parties; the penalty is a fine of up to S$1,000, up to 3 months in prison, or both, plus 12 months' "
                               'disqualification. LTA will not renew road tax unless a policy covers the whole renewal period, so every owner buys it each '
                               'year.',
                               'Motor insurance is not a warranty and does not pay for wear, mechanical failure or a driver who was drunk or unlicensed. Three '
                               'tiers are sold: third-party only, third-party fire and theft, and comprehensive, which adds damage to the car itself. Every '
                               'policy carries an excess, a no-claim discount from 10% after one claim-free year to 50% after five, and reporting rules under '
                               'the GIA Motor Claims Framework. TRS compares excess, workshop terms and named-driver conditions across insurers and runs the '
                               'claim.'],
                     'who': ['Private car owners renewing with road tax each year.',
                             'Drivers under 27 or with under 1 year of experience, who face a higher unnamed-driver excess.',
                             'Owners of older cars deciding between comprehensive and third-party fire and theft.',
                             'Families adding a spouse or child as a named driver.',
                             'Drivers who take the car into Malaysia and need the extension.',
                             'Electric vehicle owners whose repair costs move the own-damage rate.'],
                     'price': [('No-claim discount',
                                'Each claim-free year adds 10% off the premium up to 50% after 5 years; an at-fault claim drops 50% to 20%, 40% to 10% and 30% '
                                'or below to 0%.'),
                               ('Driver age and experience',
                                'Drivers under 27 or with under 1 year on the licence pay more and carry a higher excess, S$2,500 on one major wording where '
                                'unnamed.'),
                               ('Vehicle make, age and value',
                                'Repair cost and parts availability set the own-damage rate; performance and electric models cost more to repair.'),
                               ('Cover tier', 'Third-party only is cheapest; fire and theft and then comprehensive add cover and premium.'),
                               ('Excess', 'Raising the standard S$600 excess lowers the premium; buying it down to zero raises it.'),
                               ('Workshop choice', 'Any-workshop plans cost more than authorised-workshop plans; some tiers tie repairs to named workshops.')],
                     'file': ['Vehicle registration number and log card',
                              'NCD entitlement letter or current policy',
                              "Each driver's licence date and date of birth",
                              'Claims and accidents in the last 3 years',
                              'Usage: private, hire or business',
                              'Cover tier, excess and named drivers wanted'],
                     'pitfalls': [('Reporting late',
                                   'The Motor Claims Framework requires a report to the insurer and the car at an approved reporting centre within 24 hours or '
                                   'by the next working day, even for a private settlement. Miss it and the insurer can repudiate the claim, cut the NCD or '
                                   'refuse renewal.'),
                                  ('Leaving a young driver unnamed',
                                   'An unnamed driver under 27 or with under 1 year of experience triggers an excess of S$2,500 on many policies. Name every '
                                   'regular driver and check the excess for each.'),
                                  ('Using the wrong workshop',
                                   'Repairs at a workshop the insurer has not authorised can void the own-damage claim, even when the other party is at fault. '
                                   'Call the insurer hotline for towing and send the car where the policy says.')],
                     'faqs': [('What is the minimum motor insurance required by law in Singapore?',
                               'A policy from an insurer licensed in Singapore covering liability for death or bodily injury to third parties arising from use '
                               'of the vehicle. The Act does not require cover for third-party property damage, but every policy sold in Singapore includes '
                               'it, up to S$5,000,000 on one major wording. Driving without the policy carries a fine of up to S$1,000, up to 3 months in '
                               "prison, or both, and 12 months' disqualification unless the court finds special reasons."),
                              ('How does the no-claim discount work?',
                               'Each claim-free year adds 10% to the discount, to a cap of 50% after 5 years. One at-fault claim drops 50% to 20%, 40% to 10%, '
                               'and 30% or lower to 0%; two claims in a year reset it to 0%. The discount belongs to the driver, not the car, and transfers '
                               'between insurers on an NCD letter. An NCD protector add-on preserves it for the first claim, offered from 30% on most plans.'),
                              ('What must I do after an accident?',
                               'Exchange particulars, photograph the scene and the damage before moving the cars, and call the insurer hotline for towing. '
                               'Report to the insurer and bring the car to an approved reporting centre within 24 hours or by the next working day, even if '
                               'there is no damage or the parties settle privately. Make a police report within 24 hours if anyone is injured, or a '
                               'pedestrian, cyclist, foreign vehicle or government property is involved, or it is a hit-and-run.'),
                              ('What is the difference between the three cover tiers?',
                               'Third-party only covers liability for injury, death and property damage caused to others. Third-party fire and theft adds loss '
                               'of the car to fire or theft. Comprehensive adds accidental damage to the car itself, windscreen, towing and usually a personal '
                               'accident benefit for the driver. The choice turns on the value of the car against the extra premium; insurers do not offer '
                               'comprehensive terms on every older car.'),
                              ('Can I drive into Malaysia on my Singapore policy?',
                               'Most Singapore policies extend third-party cover to West Malaysia, and insurers sell a rider that adds towing, higher medical '
                               'limits and own-damage benefits there and up to 80 km into Thailand on one wording. Check the policy map before each trip. An '
                               'accident involving a Malaysian-registered vehicle requires a police report, and towing back from Malaysia is arranged under '
                               "the insurer's own terms."),
                              ('Does my NCD transfer if I switch insurer or buy a new car?',
                               'Yes. The discount belongs to the policyholder. The new insurer takes it from the NCD letter or the expiring policy, and it '
                               'moves with the owner to a replacement car. Some insurers allow a transfer between spouses or from an overseas insurer with '
                               'proof. Late reporting of an accident drops the NCD one further level on one major wording, so report every incident on time.')],
                     'sources': [('Motor Vehicles (Third-Party Risks and Compensation) Act, sections 3 and 4', 'https://sso.agc.gov.sg/Act/MVTPRCA1960'),
                                 ('GIA, Motor Claims Framework', 'https://gia.org.sg/motor-insurance/22-premium-renewal-of-policy/348-motor-claims-framewor'),
                                 ("GIA, dos and don'ts following an accident",
                                  'https://gia.org.sg/motor-insurance/22-premium-renewal-of-policy/349-dos-and-don-ts-following-an-accident.html'),
                                 ('LTA OneMotoring, insurance and road tax renewal',
                                  'https://onemotoring.lta.gov.sg/content/onemotoring/home/owning/ongoing-car-costs/insurance.html')],
                     'competitors': ['income.com.sg/car-insurance',
                                     'budgetdirect.com.sg/car-insurance',
                                     'dollarsandsense.sg/guide-understanding-no-claims-discount-ncd-works-maximise-safe-driver/']},
 'consumers/travel': {'title': 'Travel Insurance Singapore | TRS',
                      'description': 'Travel insurance Singapore: overseas medical limits from S$200,000 to unlimited, delay benefits from 3 or 6 hours, '
                                     '12-month pre-existing look-back.',
                      'intro': ['Travel insurance pays overseas medical and evacuation costs, refunds non-refundable bookings when a trip is cancelled or cut '
                                'short for an insured reason, and pays fixed sums for flight delay, baggage delay and lost belongings. Singapore residents buy '
                                'it per trip or on an annual plan because MediShield Life and Integrated Shield Plans do not pay for treatment abroad, and '
                                'because the Ministry of Foreign Affairs does not fund medical, legal or travel costs for citizens overseas. Some destinations '
                                'list insurance as an entry condition.',
                                'It is not a substitute for health insurance at home and does not cover pre-existing conditions unless a specific plan is '
                                'bought. Cover is chosen by region, trip length, up to 90 or 180 days a trip, and plan tier, which sets the medical limit, '
                                'from S$200,000 to unlimited, and the cancellation limit. Cancellation cover starts on purchase; most other sections start on '
                                'departure. TRS compares delay thresholds, sports exclusions and the pre-existing wording across insurers and files the '
                                'claim.'],
                      'who': ['Families on school-holiday trips with children added at no or low cost.',
                              'Frequent travellers taking 3 or more trips a year, where an annual plan costs less.',
                              'Travellers with a diagnosed condition who need the pre-existing plan.',
                              'Skiers, divers and trekkers checking that the activity is covered.',
                              'Travellers who paid non-refundable deposits months ahead and want cancellation cover from today.',
                              'Residents aged 70 and above, where limits and premiums change.'],
                      'price': [('Region', 'ASEAN, Asia and worldwide bands price up in that order.'),
                                ('Trip length', 'Premium rises with days away; a single trip is capped at 90 or 180 days depending on the plan.'),
                                ('Plan tier',
                                 'Medical limits from S$200,000 to unlimited and cancellation limits from S$5,000 to S$15,000 set the tier price.'),
                                ('Age', 'Travellers aged 70 and above pay more and get lower limits on most plans.'),
                                ('Pre-existing cover',
                                 'A plan that covers stable pre-existing conditions costs more and carries a 25% co-payment on some sections.'),
                                ('Add-ons', 'Cancel-for-any-reason, rental car excess, sports equipment and home contents while away are priced riders.')],
                      'file': ['Destination countries and travel dates',
                               'Names, dates of birth and NRIC or passport numbers',
                               'Single trip or annual plan',
                               'Planned activities such as skiing, diving or trekking',
                               'Pre-existing medical conditions to be covered',
                               'Non-refundable bookings already paid and their dates'],
                      'pitfalls': [('Buying at the airport',
                                    'Cancellation cover starts on the policy date, so a policy bought on departure day protects none of the deposits paid '
                                    'earlier. Buy when the first non-refundable booking is made.'),
                                   ('Ignoring the look-back period',
                                    'Insurers exclude any condition treated or showing symptoms in the 12 months before the trip unless a pre-existing plan is '
                                    'bought. Declare conditions and buy the right plan rather than hope the clause is not applied.'),
                                   ('Missing the delay threshold',
                                    'Delay benefits start only after a set number of consecutive hours, 3 or 6 depending on the insurer, and need the '
                                    "carrier's written confirmation. Get the delay letter at the counter before leaving the airport.")],
                      'faqs': [('Is travel insurance compulsory for Singapore residents?',
                                'No Singapore law requires it. The Ministry of Foreign Affairs advises every traveller to buy a policy that covers the planned '
                                'activities, states that it does not provide loans or cash for medical, legal, accommodation or travel expenses abroad, and '
                                'notes that some countries impose insurance as an entry requirement. Insurers may decline cover for destinations MFA advises '
                                'against visiting.'),
                               ('When does cover start?',
                                'Trip cancellation, postponement and travel agency insolvency cover start on the policy issue date, or the booking date on an '
                                'annual plan. Personal accident starts when the traveller leaves home for the airport or 3 hours before departure, whichever '
                                'is later, on one major wording. Medical, delay and baggage cover start on departure from Singapore and end on return. Some '
                                'insurers sell per-trip cover up to 1 day after departure.'),
                               ('Are pre-existing conditions covered?',
                                'Not on standard plans. Most exclude any condition for which the traveller had treatment, medication or symptoms in the 12 '
                                'months before the trip. Dedicated pre-existing plans cover stable conditions, with limits such as S$150,000 overseas medical '
                                'on one insurer and a 25% co-payment on travel inconvenience claims on another, and trip caps of 30 to 45 days. Conditions '
                                'with a terminal prognosis under 12 months stay excluded.'),
                               ('Single trip or annual plan?',
                                'An annual plan covers unlimited trips for 12 months, each capped at 90 consecutive days on most wordings, and costs less than '
                                'three or more single-trip policies. Single-trip plans allow longer trips, to 180 days, and are the only plans that carry '
                                'cancel-for-any-reason riders, which must be bought within 7 to 30 days of the first deposit depending on the insurer. '
                                'Multi-country trips returning to Singapore between legs need separate single-trip policies.'),
                               ('What is paid for a flight delay?',
                                'A fixed amount per block of consecutive hours, not the cost incurred. Current Singapore wordings pay S$100 per 6 hours or '
                                'S$50 per 3 hours, to plan caps of S$300 to S$2,000. The delay must be caused by weather, strikes, mechanical breakdown or '
                                'another listed reason and confirmed in writing by the carrier. Baggage delay pays a similar fixed sum per 6 hours after '
                                'arrival overseas.'),
                               ('Does it cover skiing, diving or trekking?',
                                'Recreational activities open to the public are covered on most Singapore plans, including bungee jumping, scuba diving with a '
                                'licensed operator, horse riding, winter sports and white-water rafting, provided safety rules are followed. Professional, '
                                'competitive or extreme sports are excluded, as is diving below the depth stated in the wording. Sports equipment hire and '
                                'loss need a separate rider on most plans.')],
                      'sources': [('MFA, general travel advice for Singaporeans',
                                   'https://www.mfa.gov.sg/travelling-overseas/general-travel-advice-for-singaporeans/'),
                                  ('FIDReC, jurisdiction and claim limits', 'https://www.fidrec.com.sg/knowledgebase/article/KA-01131'),
                                  ('Income, Travel Insurance policy page and limits', 'https://www.income.com.sg/travel-insurance'),
                                  ('FWD, Travel Insurance policy page and limits', 'https://www.fwd.com.sg/travel-insurance/')],
                      'competitors': ['income.com.sg/travel-insurance',
                                      'fwd.com.sg/travel-insurance/',
                                      'aig.sg/personal/travel-insurance',
                                      'moneysmart.sg/travel-insurance/travel-insurance-risk-coverage-singapore-ms']}}

SOLUTIONS = {'logistics': {'title': 'Logistics Insurance Singapore | TRS',
               'description': 'Logistics insurance in Singapore: cargo, forwarder liability, fleet and WICA for 3PLs, forwarders and hauliers, and the gaps '
                              'between them.',
               'intro': ['Logistics companies in Singapore buy insurance because a customer, a port operator or a regulator asks for it. Shipper contracts '
                         'demand proof of cargo liability cover. Prime movers and vans cannot be used on the road without third-party motor insurance under '
                         'the Motor Vehicles (Third-Party Risks and Compensation) Act. Drivers, packers and warehouse crew do manual work, so MOM requires '
                         'work injury compensation insurance for each of them regardless of pay. Each non-Malaysian Work Permit holder also needs a S$60,000 '
                         'medical policy and a S$5,000 security bond.',
                         'The programme is not a single policy. Cargo insurance pays the owner of the goods; forwarder liability pays claims against the '
                         'operator; motor fleet covers the vehicles; work injury compensation covers the crew. Each is bought on a different basis: cargo on '
                         'an open cover declared by shipment or turnover, liability on an annual limit with a deductible (the amount the insured pays first). '
                         'The gap is usually goods in the warehouse between legs, or a sub-contracted haulier whose cover was never checked. The broker maps '
                         'every handover and places each piece.'],
               'risks': [('Cargo loss in transit',
                          'A container is dropped, flooded or stolen between pick-up and delivery. The owner claims the invoice value plus freight, while the '
                          "forwarder's trading conditions cap its own liability by weight.",
                          'Marine cargo on an annual open cover, Institute Cargo Clauses (A), with a per-conveyance limit above the largest consignment '
                          'carried.'),
                         ('Forwarder liability',
                          'A mis-declared shipment, a wrong release or a customs delay produces a claim from the shipper or a fine from the authority. '
                          'Standard trading conditions limit liability only if they were incorporated into the contract.',
                          'Freight forwarders liability with errors and omissions, fines and penalties, and a limit that matches the trading conditions in '
                          'use.'),
                         ('Warehouse fire or theft',
                          "Customer stock held in a leased warehouse burns or is stolen. The customer claims under the storage contract, and the operator's "
                          'own racking and handling equipment is a separate loss.',
                          "Warehouse legal liability for customer goods plus property cover on the operator's own fittings and equipment, with stock values "
                          'declared monthly.'),
                         ('Fleet accidents',
                          'A prime mover injures a third party or damages a vehicle. Third-party death and bodily injury cover is compulsory under the Motor '
                          'Vehicles Act; third-party property damage and own damage are not.',
                          'Comprehensive commercial fleet cover with third-party property damage and a fleet-wide deductible, not a per-vehicle '
                          'third-party-only policy.'),
                         ('Worker injury',
                          'A packer or driver is injured at work. For accidents from 1 November 2025, WICA compensation reaches S$346,000 for permanent '
                          'incapacity and S$53,000 for medical expenses, and an uninsured employer pays it.',
                          'Work injury compensation from an MOM-designated insurer for every manual worker, plus the S$60,000 medical policy for each Work '
                          'Permit holder.'),
                         ('Customer insolvency',
                          'A large shipper stops paying freight invoices and enters liquidation. Thirty to ninety days of billed work becomes a bad debt.',
                          'Trade credit insurance on the receivables ledger with a credit limit set per buyer.')],
               'programme': [('commercial/inventory',
                              'Marine cargo on an open cover insures the goods themselves for the customer or for the forwarder acting as agent.'),
                             ('commercial/inland-transit',
                              'Inland transit covers the last mile and the port-to-warehouse leg that an ocean or air policy stops short of.'),
                             ('commercial/motor',
                              'Commercial fleet cover meets the Motor Vehicles Act and adds the third-party property damage a prime mover accident produces.'),
                             ('commercial/core-liability',
                              "Public liability answers injury and damage at the warehouse, the yard and the customer's loading bay."),
                             ('commercial/workmen',
                              'Drivers, packers and warehouse crew are manual workers, so WICA cover is compulsory for each of them regardless of salary.'),
                             ('commercial/foreign-worker',
                              'Each Work Permit holder needs a medical policy of at least S$60,000 a year before the permit is issued or renewed.')],
               'faqs': [('Does my forwarder liability policy cover the cargo itself?',
                         'No. Forwarder liability pays claims made against the operator for its own errors, up to the limit in its trading conditions. The '
                         'cargo owner recovers the full value only from a cargo policy. If the customer has none, the forwarder can arrange cargo cover as '
                         'agent under its open cover and charge for it.'),
                        ('Is cargo insurance compulsory in Singapore?',
                         'No. The only compulsory covers for a logistics company are third-party motor insurance for each vehicle and work injury compensation '
                         'for employees. Cargo cover is a contractual matter between the shipper, the forwarder and the carrier. Most shipper contracts and '
                         'bank letters of credit require it.'),
                        ('Do I need WICA cover for drivers earning more than S$2,600 a month?',
                         'Yes. MOM requires work injury compensation insurance for all employees doing manual work regardless of salary, and for non-manual '
                         'employees earning S$2,600 or less a month. Drivers, packers and forklift operators are manual workers. From 1 January 2021 the '
                         'policy must come from an MOM-designated insurer. Failure to insure carries a fine of up to S$10,000, jail of up to 12 months, or '
                         'both.'),
                        ('What must the Work Permit medical policy cover?',
                         'At least S$60,000 a year per worker for inpatient care and day surgery. For policies from 1 July 2023 the insurer pays 75 per cent '
                         'and the employer 25 per cent of claims above S$15,000. From 1 July 2025 exclusion clauses are standardised, premiums are set in two '
                         'age bands, and insurers pay hospitals directly. The cost cannot be passed to the worker.'),
                        ('How is an open cargo cover declared?',
                         'Either by shipment, with a declaration per consignment, or by annual turnover, with a deposit premium adjusted at year end. The '
                         'insurer sets a limit per conveyance and per location. Turnover declarations suit high-volume forwarders; per-shipment declarations '
                         'suit project cargo and high-value consignments.')],
               'sources': [('MOM, work injury compensation insurance',
                            'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                           ('MOM, types of compensation', 'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation'),
                           ('MOM, Work Permit medical insurance',
                            'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance'),
                           ('Motor Vehicles (Third-Party Risks and Compensation) Act 1960', 'https://sso.agc.gov.sg/Act/MVTPRCA1960')],
               'competitors': ['howdengroup.com/sg-en/marine-sector-capabilities',
                               'howdengroup.com/sg-en/sector',
                               'aon.com/en-sg/industries',
                               'aig.sg/business/business-products-and-services/marine/freight-forwarders-liability']},
 'energy': {'title': 'Energy and Chemicals Insurance Singapore | TRS',
            'description': 'Energy and chemicals insurance in Singapore: plant property, business interruption, machinery breakdown, pollution liability and '
                           'WICA.',
            'intro': ['Energy and chemical operators in Singapore insure because lenders, landlords and MOM require it. A plant that stores or processes '
                      'dangerous substances above the threshold quantities is a major hazard installation under the Workplace Safety and Health (MHI) '
                      'Regulations and must keep a safety case. Leases and project financing agreements set minimum property and liability limits. Contractors '
                      'on site do manual work, so work injury compensation insurance is compulsory for each of them. A single shutdown can cost more in lost '
                      'margin than in repair.',
                      'The programme is not a general business package. It is a property damage policy on the plant, a business interruption section with an '
                      'indemnity period (the months of lost profit the insurer pays), machinery breakdown for turbines, compressors and transformers, and '
                      'pollution liability for sudden and gradual release. Property is bought at declared reinstatement value with a deductible per event. The '
                      'gaps are usually values not updated after a capacity upgrade, an indemnity period shorter than the lead time for replacement equipment, '
                      "and contractors' cover never checked against the site's limits."],
            'risks': [('Fire or explosion at the plant',
                       'A release ignites and damages process units, tankage and neighbouring property. Repair takes months, and the WSH Act fine for a '
                       'corporate body reaches S$500,000 on a first conviction.',
                       'Property damage on an all-risks basis at full reinstatement value, with a per-event deductible the balance sheet can carry.'),
                      ('Prolonged shutdown',
                       'A damaged compressor has a nine-month lead time and the plant runs at half capacity. Fixed costs and contracted supply obligations '
                       'continue without the margin.',
                       'Business interruption with an indemnity period at least as long as the longest replacement lead time, plus an increased cost of '
                       'working sub-limit.'),
                      ('Machinery breakdown',
                       'A turbine, transformer or reactor fails from an internal cause with no fire. Standard property policies exclude mechanical and '
                       'electrical breakdown.',
                       'Machinery breakdown cover scheduled by unit, with business interruption following breakdown added as an extension.'),
                      ('Pollution release',
                       'A spill or vapour release reaches a neighbour, a waterway or the sea. The agencies order clean-up and third parties claim for damage.',
                       'Environmental impairment liability for sudden and gradual pollution, because public liability wordings limit pollution to sudden and '
                       'accidental events if they cover it at all.'),
                      ('Contractor injury on site',
                       'Turnaround and construction crews are covered by WICA through their own employer, and the site owner is drawn into every serious '
                       'incident. Permanent incapacity compensation now reaches S$346,000.',
                       'Work injury compensation for own staff, with a contract term that every contractor produces a current WICA certificate before '
                       'mobilising.'),
                      ('Construction and commissioning',
                       'A new unit, solar array or battery system is damaged during erection, testing or commissioning. The operating property policy does not '
                       'attach until handover.',
                       "Contractors' all risks or erection all risks for the project period, with testing and commissioning and a maintenance period "
                       'included.')],
            'programme': [('commercial/property', 'Property damage at reinstatement value is the base layer that lenders and landlords check first.'),
                          ('commercial/revenue',
                           'Business interruption pays the lost gross profit of a shutdown for an indemnity period set to the longest equipment lead time.'),
                          ('commercial/equipment',
                           'Machinery breakdown insures the internal failures of rotating and electrical plant that the fire policy excludes.'),
                          ('commercial/core-liability',
                           'Public liability answers third-party injury and damage, and is the base to which pollution liability is added.'),
                          ('commercial/car', "Contractors' all risks covers each new unit, array or expansion during construction and commissioning."),
                          ('commercial/workmen',
                           'Operators, technicians and maintenance crew are manual workers, so WICA cover is compulsory regardless of salary.')],
            'faqs': [('Is pollution covered under our public liability policy?',
                      'Usually only for sudden and accidental events, and many wordings exclude pollution entirely. Gradual seepage, long-term contamination '
                      'and agency-ordered clean-up need environmental impairment liability. It is written on a claims-made basis, meaning the policy in force '
                      'when the claim is made responds, so a retroactive date before the site started operating matters.'),
                     ('How long should the business interruption indemnity period be?',
                      'At least as long as the time to source, ship, install and recommission the critical unit with the longest lead time, plus the time to '
                      'rebuild the market. Insurers ask for the figure in months. A period chosen to save premium that ends before the plant is back at full '
                      'output leaves the balance of the loss with the company.'),
                     ('What makes a site a major hazard installation?',
                      'MOM classifies petroleum refining, petrochemical manufacturing and chemical processing plants, and any installation storing or using '
                      'toxic or flammable substances at or above the threshold quantities, as MHIs. MHIs must keep and maintain a safety case under the '
                      'Workplace Safety and Health (MHI) Regulations. Insurers underwriting an MHI ask for the safety case and the loss prevention record.'),
                     ('Do we need separate cover for a solar or battery project?',
                      "Yes. During construction the project needs contractors' all risks or erection all risks, including testing and commissioning. After "
                      'handover it moves onto the operating property policy, with machinery breakdown for inverters and transformers and business interruption '
                      'for lost generation revenue. The two policies must meet at the handover date without a gap.'),
                     ('Can insurance pay a WSH Act fine?',
                      'No. Fines are not insurable. Under the WSH Act a corporate body faces a fine of up to S$500,000 on a first conviction and S$1 million '
                      "as a repeat offender; an individual faces up to S$200,000 and two years' jail. Liability policies can pay legal defence costs for the "
                      'company and D&O can pay them for directors and managers.')],
            'sources': [('MOM, major hazard installations safety case regime',
                         'https://www.mom.gov.sg/workplace-safety-and-health/major-hazard-installations/safety-case-regime'),
                        ('MOM, WSH Act liabilities and penalties',
                         'https://www.mom.gov.sg/workplace-safety-and-health/workplace-safety-and-health-act/liabilities-and-penalties'),
                        ('MOM, work injury compensation insurance',
                         'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                        ('MOM, types of compensation', 'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation')],
            'competitors': ['howdengroup.com/sg-en/marine-sector-capabilities',
                            'chubb.com/sg-en/business/industry-practices.html',
                            'aon.com/en-sg/industries',
                            'marsh.com/sg/industries.html']},
 'wholesale': {'title': 'Wholesale and Distribution Insurance Singapore | TRS',
               'description': 'Wholesale and distribution insurance in Singapore: stock throughput, product liability, trade credit and warehouse property for '
                              'importers.',
               'intro': ['Wholesalers and distributors in Singapore buy insurance when a landlord, a bank or a principal asks. A warehouse lease requires fire '
                         "cover on the premises. An inventory financing line requires the bank's interest noted on the stock policy. A foreign principal's "
                         'distribution agreement requires product liability at a stated limit. Stock is the largest asset on the balance sheet and it moves '
                         'daily between the port, the warehouse and the customer. Credit terms of 30 to 90 days put a second large asset, the receivables '
                         'ledger, at risk.',
                         "A distributor's programme is not a shop package. Stock is insured either on separate cargo and warehouse policies or on one stock "
                         "throughput policy that follows goods from the supplier's door to the customer's, valued at cost plus a stated uplift. Products "
                         "liability sits on the public liability policy and must name the goods sold. Trade credit insures receivables against a buyer's "
                         'insolvency or protracted default. The gaps are usually stock in a third-party warehouse, goods delivered but unpaid, and peak-season '
                         'stock above the declared sum insured.'],
               'risks': [('Warehouse fire',
                          'A fire in a shared industrial building destroys the stock and the racking. The declared sum insured was set in January and the '
                          'December stock was double.',
                          'Property or stock throughput on a declaration basis with a peak-season limit, so the sum insured follows the stock rather than the '
                          'calendar.'),
                         ('Stock in transit',
                          'An import container is lost overboard, or a local delivery van is hijacked. The supplier was paid on shipment and the customer has '
                          'not taken delivery.',
                          'Stock throughput or marine cargo on an open cover, Institute Cargo Clauses (A), covering both the inbound ocean leg and local '
                          'distribution.'),
                         ('Product liability claim',
                          'A distributed product injures a consumer or damages property. The customer who bought from the distributor claims against the '
                          'distributor under the sale contract, whoever made the goods.',
                          "Products liability on an occurrence basis at the limit the principal's agreement requires, with the product range named in the "
                          'schedule.'),
                         ('Buyer default',
                          'A major retailer or reseller enters judicial management owing 60 days of invoices. The distributor has already paid the principal '
                          'for the goods.',
                          'Trade credit insurance with a credit limit per buyer and cover for both insolvency and protracted default, usually at 85 to 90 per '
                          'cent of the invoice.'),
                         ('Business interruption after a loss',
                          "The warehouse is unusable for four months after a fire. Rent, salaries and the principal's minimum purchase commitment continue "
                          'without sales.',
                          'Business interruption on gross profit with an indemnity period long enough to find, fit out and restock a replacement warehouse.'),
                         ('Worker injury',
                          'A picker or forklift driver is injured. Warehouse staff do manual work, so WICA cover is compulsory regardless of salary, with '
                          'medical expenses up to S$53,000 per accident.',
                          'Work injury compensation from an MOM-designated insurer for every manual worker and every non-manual employee earning S$2,600 or '
                          'less a month.')],
               'programme': [('commercial/stock-throughput',
                              'One stock throughput policy follows goods from the supplier to the customer and removes the gap between cargo and warehouse '
                              'policies.'),
                             ('commercial/inventory',
                              'Marine cargo on an open cover insures each inbound shipment when the distributor buys on FOB or EXW terms.'),
                             ('commercial/financial-assets',
                              'Trade credit insures the receivables ledger so credit terms can be offered without carrying the bad debt.'),
                             ('commercial/core-liability',
                              'Public and products liability answers consumer and customer claims for goods the distributor sells but did not make.'),
                             ('commercial/property',
                              "Property covers the warehouse fit-out, racking and office contents, and meets the landlord's lease requirement."),
                             ('commercial/revenue', 'Business interruption pays the gross profit lost while a damaged warehouse is replaced and restocked.')],
               'faqs': [('Should I buy stock throughput or separate cargo and warehouse policies?',
                         'Stock throughput suits a distributor whose stock is in motion most of the time and who holds it in more than one location. One '
                         'policy, one insurer and one valuation basis remove the argument over which policy pays when goods are damaged on the loading bay. '
                         'Separate policies suit a business with a single warehouse and few inbound shipments.'),
                        ('What does trade credit insurance pay?',
                         'A percentage of the unpaid invoice, usually 85 to 90 per cent, when a covered buyer becomes insolvent or fails to pay within the '
                         'protracted default period set in the policy. Each buyer has a credit limit set by the insurer. Sales above the limit are uninsured, '
                         'so the limit must be reviewed as a customer grows.'),
                        ('Am I liable for a product I only distribute?',
                         "Yes. The customer's contract is with the distributor, so the first claim for a defective product lands on the distributor under the "
                         'sale contract. The distributor may recover from the manufacturer, but a foreign maker can be slow or beyond reach. Products '
                         'liability cover responds to the claim; a recall extension pays the cost of withdrawing the batch.'),
                        ('How do I insure stock that peaks before festive seasons?',
                         'Insure on a declaration basis. The policy carries a maximum limit set at the peak and the premium is adjusted on monthly or '
                         'quarterly stock declarations. A fixed sum insured set at the average leaves the peak under-insured, and the average clause then '
                         'reduces every claim in proportion.'),
                        ('Does my fire policy cover stock in a third-party warehouse?',
                         'Only if that location is named in the schedule. A fire policy covers the premises listed. Stock at a 3PL, a bonded warehouse or a '
                         'consignment customer needs the location added or a stock throughput policy that covers goods anywhere in Singapore within a '
                         'per-location limit.')],
               'sources': [('MOM, work injury compensation insurance',
                            'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                           ('MOM, types of compensation', 'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation')],
               'competitors': ['aon.com/en-sg/industries',
                               'marsh.com/sg/industries.html',
                               'chubb.com/sg-en/business/industry-practices.html',
                               'qbe.com/sg/business-insurance (search snippet only)']},
 'financial-services': {'title': 'Financial Services Insurance Singapore | TRS',
                        'description': 'Financial services insurance in Singapore: PI, D&O, crime and cyber for fund managers, advisers and brokers, and the '
                                       'MAS PI minimums.',
                        'intro': ["Financial firms in Singapore buy insurance because MAS, a fund's investors or a counterparty requires it. A licensed "
                                  'financial adviser with revenue of S$5 million or less must hold professional indemnity of S$1 million. A retail fund '
                                  'manager must hold S$2 million, rising to S$25 million with assets under management. Registered insurance brokers must hold '
                                  'professional indemnity under the Insurance (Intermediaries) Regulations. Fund side letters and institutional due diligence '
                                  'questionnaires ask for D&O and crime limits before an allocation is made.',
                                  'The programme is not one policy. Professional indemnity answers client claims for negligent advice or breach of mandate. '
                                  'Directors and officers cover answers regulatory inquiries and shareholder actions against individuals. Crime cover pays the '
                                  "firm's own loss from employee dishonesty or forged instructions. Cyber pays breach response and PDPA costs. All are "
                                  'claims-made: the policy in force when the claim is made responds, for acts after the retroactive date. The gaps are usually '
                                  'a deductible above the MAS cap, a fund entity missing from the D&O, or an uninsured outsourced administrator.'],
                        'risks': [('Negligent advice or breach of mandate',
                                   'A client alleges the portfolio was run outside the mandate or the advice was unsuitable. Defence costs start at the first '
                                   "letter and the claim is measured against the client's loss.",
                                   'Professional indemnity at or above the MAS minimum, with defence costs in addition to the limit and the deductible under '
                                   '20 per cent of base capital.'),
                                  ('Regulatory investigation',
                                   'MAS begins an inspection that leads to a formal inquiry. Directors incur legal costs before any finding, and the company '
                                   'may be unable to indemnify them.',
                                   'D&O with Side A cover for individuals and a regulatory investigation costs extension that triggers at the first formal '
                                   'request.'),
                                  ('Employee or third-party fraud',
                                   "A staff member diverts client money, or a forged payment instruction is acted on. The loss is the firm's own and no "
                                   'liability policy responds.',
                                   'Commercial crime cover for employee dishonesty, forgery, funds transfer fraud and social engineering, with a limit sized '
                                   'to the largest single payment.'),
                                  ('Client data breach',
                                   'KYC files and account data are exfiltrated. The PDPC must be notified within 3 calendar days once the breach is assessed '
                                   'as notifiable, and the penalty cap is 10 per cent of Singapore turnover.',
                                   'Cyber liability with breach response costs, regulatory defence and a limit sized to the number of client records held.'),
                                  ('Licence condition shortfall',
                                   'An audit finds the professional indemnity limit or deductible below the MAS requirement. The firm is in breach of a '
                                   'licence condition until it is corrected.',
                                   'Professional indemnity placed to the MAS scale for the licence type, reviewed at every change in assets under management '
                                   'or revenue.'),
                                  ('Loss of a key portfolio manager',
                                   'The founder or lead manager dies or is incapacitated. Investors have a key person clause and can redeem or suspend the '
                                   'fund.',
                                   'Keyman insurance on the named individuals at a sum that funds the transition period the fund documents allow.')],
                        'programme': [('commercial/imi',
                                       'Investment management insurance combines PI, D&O and crime for fund managers in one wording, so the limits meet both '
                                       'MAS and investor requirements.'),
                                      ('commercial/professional',
                                       'Professional indemnity meets the MAS minimum for financial advisers, fund managers and insurance brokers.'),
                                      ('commercial/dao',
                                       'D&O defends directors and officers against regulatory inquiries and shareholder actions, with Side A cover when the '
                                       'company cannot indemnify.'),
                                      ('commercial/cyber',
                                       'Cyber pays breach response, forensics, notification and regulatory defence for client data held under the PDPA.'),
                                      ('employees/medical',
                                       'Group medical is standard in financial services employment contracts and is checked in every hire negotiation.'),
                                      ('employees/benefits',
                                       'Group term life and disability income meet the benefits schedule that institutional employers set.')],
                        'faqs': [('What professional indemnity limit does MAS require for a licensed financial adviser?',
                                  'For advisers with revenue of S$5 million or less, S$1 million. Above S$5 million, the lower of 20 per cent of gross revenue '
                                  'or S$10 million. A firm that only issues research needs S$500,000. Base capital is S$500,000, or S$300,000 with an '
                                  'additional S$500,000 of professional indemnity insurance.'),
                                 ('What are the MAS professional indemnity rules for fund managers?',
                                  'MAS may impose a licence condition requiring a retail licensed fund management company to hold professional indemnity on a '
                                  'scale from S$2 million below S$100 million of assets under management to S$25 million at S$10 billion and above, with the '
                                  'deductible no more than 20 per cent of base capital. Managers serving accredited and institutional investors are strongly '
                                  'encouraged to hold it and must disclose their arrangements, or the absence of cover, to every customer.'),
                                 ('What does claims-made mean and why does the retroactive date matter?',
                                  'A claims-made policy responds to claims first made during the policy period, not when the work was done. The retroactive '
                                  "date is the earliest date of work the policy will cover. If it is set at the current renewal rather than the firm's "
                                  'founding date, advice given in earlier years is uninsured. Continuous cover without a gap keeps the original date.'),
                                 ('Does D&O cover the fund as well as the management company?',
                                  'Only if the fund entities are named as insureds. A management company D&O covers its own directors. Fund directors, general '
                                  'partners and investment committee members need the fund vehicles scheduled on the policy, or a separate fund D&O. '
                                  'Investment management insurance packages do this in one wording.'),
                                 ('What must we do after a data breach under the PDPA?',
                                  'Assess whether the breach is notifiable within 30 calendar days of discovering it. If it causes or is likely to cause '
                                  'significant harm, or affects 500 or more individuals, notify the PDPC within 3 calendar days of that assessment and notify '
                                  'affected individuals as soon as practicable. Penalties for contraventions from 1 October 2022 reach 10 per cent of annual '
                                  'Singapore turnover where turnover exceeds S$10 million, or S$1 million otherwise.')],
                        'sources': [("MAS, financial adviser's licence requirements",
                                     'https://www.mas.gov.sg/regulation/capital-markets/financial-advisers-licence'),
                                    ('MAS, Guidelines on Licensing and Conduct of Business for Fund Management Companies (SFA 04-G05)',
                                     'https://www.mas.gov.sg/-/media/mas-media-library/regulation/guidelines/cmg/guideline-sfa-04-g05-on-licensing-registration-and-conduct-of-business-for-fund-managers/sfa--guidelines-on-licensing-and-conduct-of-business-for-fmcs-10-dec-2024.pdf'),
                                    ('MAS, insurance broker registration',
                                     'https://www.mas.gov.sg/regulation/insurance/insurance-broker-registration-and-approval'),
                                    ('Personal Data Protection Act 2012', 'https://sso.agc.gov.sg/Act/PDPA2012')],
                        'competitors': ['howdengroup.com/sg-en/sector',
                                        'aon.com/en-sg/industries',
                                        'marsh.com/sg/industries.html',
                                        'lockton.com/apac/en/products-services/technology-insurance']},
 'built-environment': {'title': 'Construction Insurance Singapore | Built Environment | TRS',
                       'description': 'Construction insurance in Singapore: CAR, public liability, performance bonds, WICA and Work Permit cover for '
                                      'contractors meeting PSSCOC terms.',
                       'intro': ['Contractors, developers and consultants in Singapore buy insurance because the contract says so. The Public Sector Standard '
                                 'Conditions of Contract 2020 require the contractor to insure the works and third-party liability for the contract period. '
                                 'Tenders ask for a performance bond and an insurance schedule at award. MOM requires work injury compensation for every site '
                                 'worker, plus a S$60,000 medical policy and a S$5,000 security bond for each non-Malaysian Work Permit holder. Main '
                                 'contractors push the same requirements down to every sub-contractor.',
                                 "The programme is not a single site policy. Contractors' all risks (CAR) covers the works and materials for physical damage; "
                                 'public liability covers third-party injury and damage, including neighbouring buildings; a performance bond secures the '
                                 'employer against default; work injury compensation and Work Permit cover handle the workforce; professional indemnity '
                                 'answers design claims. CAR is bought per project on the contract value or annually on turnover. The gaps are usually '
                                 'vibration and weakening of support, a maintenance period that ends before defects liability, and bond capacity exhausted '
                                 'before the next tender.'],
                       'risks': [('Damage to the works',
                                  'A collapse, flood or fire destroys completed sections and materials on site. The contractor must reinstate at its own cost '
                                  'before the employer pays again.',
                                  "Contractors' all risks at full contract value with escalation, plus testing, commissioning and a maintenance period "
                                  'matching the defects liability period.'),
                                 ('Damage to neighbouring property',
                                  'Piling or excavation cracks an adjacent building or sinks a road. Claims arrive from owners, the authority and the utility.',
                                  'Public liability with vibration, removal or weakening of support included, at a limit at least equal to the contract '
                                  'requirement.'),
                                 ('Worker injury or death',
                                  'A worker falls or is struck on site. For accidents from 1 November 2025, WICA death compensation reaches S$269,000, and the '
                                  'WSH Act fine for a company reaches S$500,000 on a first conviction.',
                                  'Work injury compensation from an MOM-designated insurer for every worker, plus the Work Permit medical policy and security '
                                  'bond per worker.'),
                                 ('Bond call',
                                  'The employer calls the performance bond after a delay or dispute. An on-demand bond pays first and argues later, and a bank '
                                  'bond ties up the facility.',
                                  'Surety bond from an insurer with conditional or on-demand wording as the contract permits, keeping the bank line free for '
                                  'working capital.'),
                                 ('Design error',
                                  'A consultant or design-and-build contractor specifies a member that fails or a system that cannot be certified. '
                                  'Rectification and delay costs follow.',
                                  'Professional indemnity on a claims-made basis with a retroactive date that covers every live project.'),
                                 ('Plant and equipment',
                                  'A hired crane or an owned excavator is damaged or stolen on site. The hire contract makes the contractor liable for the '
                                  'full value.',
                                  "Contractors' plant and equipment cover on owned units and a hired-in plant section at the hirer's replacement value.")],
                       'programme': [('commercial/car',
                                      "Contractors' all risks covers the works, materials and third-party liability for the contract period and the "
                                      'maintenance period, as PSSCOC and private contracts require.'),
                                     ('commercial/core-liability',
                                      'Public liability at the contract limit answers neighbouring property damage and third-party injury from site '
                                      'operations.'),
                                     ('commercial/surety-bonds',
                                      'Performance, advance payment and maintenance bonds from an insurer meet the tender security without using the bank '
                                      'facility.'),
                                     ('commercial/workmen',
                                      'Every site worker is a manual worker, so WICA cover from a designated insurer is compulsory regardless of salary.'),
                                     ('commercial/foreign-worker',
                                      'Each Work Permit holder needs a medical policy of at least S$60,000 a year and a S$5,000 security bond before the '
                                      'permit is issued.'),
                                     ('commercial/professional',
                                      'Professional indemnity answers design claims against consultants and design-and-build contractors on a claims-made '
                                      'basis.')],
                       'faqs': [('Does CAR cover the defects liability period?',
                                 'Only if a maintenance period of the same length is written into the policy. The construction period ends at practical '
                                 'completion. A maintenance clause then covers damage the contractor causes while rectifying defects, and an extended '
                                 'maintenance clause also covers damage arising from a cause during the construction period. The policy period must run to the '
                                 'end of defects liability, including any extension of time.'),
                                ('Is an insurance bond or a bank guarantee better for a performance bond?',
                                 'An insurance surety bond does not reduce the bank facility or require cash collateral, so working capital stays free. A bank '
                                 'guarantee is usually on demand and secured against the facility. The contract decides what is acceptable: PSSCOC and most '
                                 "private contracts accept a bond from an approved insurer. The surety underwrites the contractor's financials and track "
                                 'record before issuing.'),
                                ("Who buys WICA cover for sub-contractors' workers?",
                                 'Each employer must hold its own work injury compensation policy. MOM treats the cover as employer-centric, so a main '
                                 "contractor's policy does not cover a sub-contractor's employees unless the policy is extended to name them. The main "
                                 'contractor should collect a current WICA certificate from every sub-contractor before mobilisation, because an injured '
                                 'worker can claim against the principal if the sub-contractor is uninsured.'),
                                ('What does the S$5,000 security bond do?',
                                 "It is MOM's security for each non-Malaysian Work Permit holder. It is forfeited if the employer or worker breaks the permit "
                                 'conditions, salary is paid late, the worker goes missing, or the worker is not repatriated when the permit ends. The '
                                 'employer cannot recover the cost from the worker. An insurer issues the bond for a premium and the employer remains liable '
                                 'to reimburse any forfeiture.'),
                                ('Can one annual policy cover all our projects?',
                                 'Yes. An annual CAR policy covers every contract started in the year up to a stated contract value and period, declared on '
                                 'turnover. It suits contractors with many small and medium jobs. A project exceeding the policy limits is placed separately. '
                                 'Public liability and work injury compensation are already annual, so the annual CAR removes the per-project paperwork at '
                                 'award.')],
                       'sources': [('BCA, Public Sector Standard Conditions of Contract',
                                    'https://www1.bca.gov.sg/growth-and-transformation/procurement/standard-contract-forms/public-sector-standard-conditions-of-contract-psscoc/'),
                                   ('MOM, work injury compensation insurance',
                                    'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                                   ('MOM, Work Permit medical insurance',
                                    'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance'),
                                   ('MOM, security bond',
                                    'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/security-bond')],
                       'competitors': ['marsh.com/sg/industries/construction/products/contractors-risk-and-insurance-solutions.html',
                                       'howdengroup.com/sg-en/sector',
                                       'aon.com/singapore/risk-services/products-services/construction',
                                       'chubb.com/sg-en/business/industry-practices.html']},
 'healthcare': {'title': 'Healthcare and Life Sciences Insurance Singapore | TRS',
                'description': 'Healthcare insurance in Singapore: medical malpractice, clinical trials, product liability and cyber for HCSA-licensed clinics '
                               'and biomedical firms.',
                'intro': ['Clinics, hospitals, laboratories and biomedical companies in Singapore buy insurance because a licence, a hospital credentialing '
                          'committee or a trial sponsor asks for it. The Healthcare Services Act replaced the Private Hospitals and Medical Clinics Act in '
                          'three phases from 3 January 2022, and every licensee must meet its licensing conditions. Doctors need Singapore Medical Council '
                          'registration and a practising certificate, and private hospitals require indemnity cover before granting admitting rights. HSA can '
                          'make sponsor insurance a condition of a clinical trial authorisation.',
                          'The programme is not a single malpractice policy. Medical malpractice covers the practitioner and the entity for clinical '
                          'negligence; public liability covers a patient who slips in the waiting room; cyber covers patient records and PDPA notification; '
                          'electronic equipment covers imaging and laboratory instruments; products liability covers devices and consumables sold. Malpractice '
                          'is claims-made: the policy in force when the claim is made responds, for treatment after the retroactive date. The gaps are usually '
                          'locum doctors assumed to be covered, run-off when a practitioner retires, and research work outside the clinical policy.'],
                'risks': [('Clinical negligence claim',
                           'A patient alleges a missed diagnosis, a surgical error or a wrong prescription. Defence costs run from the first letter of demand '
                           'through SMC complaint and civil claim.',
                           'Medical malpractice on a claims-made basis covering the entity and each named practitioner, with SMC disciplinary defence costs '
                           'included.'),
                          ('Patient data breach',
                           'Clinical records are exposed. The PDPC must be notified within 3 calendar days once the breach is assessed as notifiable, and a '
                           'breach affecting 500 or more individuals is notifiable on scale alone.',
                           'Cyber liability with breach response, notification, forensics and regulatory defence, at a limit sized to the number of patient '
                           'records held.'),
                          ('Equipment failure',
                           'An MRI, CT scanner or analyser fails from an electrical fault or is damaged by water. Replacement is months away and bookings move '
                           'to a competitor.',
                           'Electronic equipment insurance on an all-risks basis at reinstatement value, with a business interruption extension for lost '
                           'fees.'),
                          ('Clinical trial injury',
                           'A trial participant suffers an adverse event. The sponsor and the site face compensation claims, and HSA approval of the trial can '
                           'carry an insurance condition.',
                           'Clinical trials liability per protocol, naming sponsor, site and investigators, for the trial duration and a tail period for '
                           'late-emerging injury.'),
                          ('Product defect',
                           'A device, implant or consumable fails in use. The manufacturer, the importer and the distributor are each drawn into the claim.',
                           'Products liability with a limit the hospital purchasing contract accepts and a recall extension for the cost of withdrawing the '
                           'batch.'),
                          ('Practitioner retirement or departure',
                           'A doctor leaves the practice and a claim arrives two years later for treatment given while employed. The current policy covers '
                           'only current staff.',
                           'Run-off cover for departing practitioners, or an entity policy that covers former practitioners for work done while employed.')],
                'programme': [('commercial/medical-malpractice',
                               'Medical malpractice answers clinical negligence claims and SMC complaints for the entity and each practitioner.'),
                              ('commercial/cyber', 'Cyber covers the breach response and PDPA obligations that follow any exposure of patient records.'),
                              ('commercial/core-liability',
                               'Public and products liability answers non-clinical injury on the premises and claims from devices or consumables sold.'),
                              ('commercial/electronic-equipment',
                               'Electronic equipment insures imaging, laboratory and dental equipment against electrical failure and accidental damage.'),
                              ('commercial/property',
                               "Property covers the clinic or laboratory fit-out and contents, and meets the landlord's lease requirement."),
                              ('employees/medical',
                               'Group medical for clinical and administrative staff is expected by every hire and is the base of the benefits schedule.')],
                'faqs': [('Is medical indemnity compulsory for doctors in Singapore?',
                          'No statute sets a minimum indemnity limit for doctors. Every doctor must be registered with the Singapore Medical Council and hold '
                          'a practising certificate. In practice the employer, the private hospital granting admitting rights and the HCSA licensee set the '
                          'requirement, and most require cover before a doctor sees patients. Indemnity comes either from a medical defence organisation or '
                          "from an insurer's malpractice policy."),
                         ('What is run-off cover?',
                          'A claims-made malpractice policy covers claims made while it is in force. When a practitioner retires or a clinic closes, claims '
                          'can still arrive for earlier treatment. Run-off cover keeps the policy responding to those claims for a set number of years after '
                          'the practice stops. Without it, the practitioner is uninsured for the tail.'),
                         ("Are locum doctors covered under the clinic's policy?",
                          'Only if the policy says so. Many entity policies cover employed practitioners and exclude locums and visiting consultants, who are '
                          'expected to hold their own cover. A clinic that uses locums should either have them named or have the policy extended to cover any '
                          "practitioner working under its licence, and should collect proof of each locum's own indemnity."),
                         ('What must a clinic do after a patient data breach?',
                          'Assess whether the breach is notifiable within 30 calendar days. Health records are likely to cause significant harm if exposed, '
                          'and a breach affecting 500 or more individuals is notifiable on scale. Notify the PDPC within 3 calendar days of that assessment '
                          'and the affected patients as soon as practicable. The penalty cap is 10 per cent of annual Singapore turnover where turnover '
                          'exceeds S$10 million, or S$1 million otherwise.'),
                         ('Does a clinic need public liability as well as malpractice?',
                          'Yes. Malpractice covers injury arising from clinical treatment. Public liability covers injury and property damage that has nothing '
                          'to do with treatment: a fall in the waiting room, a water leak into the unit below, a visitor hit by a trolley. The two policies '
                          'have different triggers, and a claim that falls between them is paid by the clinic.')],
                'sources': [('MOH, notice of phase 3 implementation of the Healthcare Services Act',
                             'https://www.moh.gov.sg/licensing-and-regulation/regulations-guidelines-and-circulars/details/notice-of-phase-3-implementation-of-the-healthcare-services-act-(hcsa)'),
                            ('SMC, becoming a registered doctor', 'https://www.smc.gov.sg/becoming-a-registered-doctor'),
                            ('HSA, regulatory overview of clinical trials', 'https://www.hsa.gov.sg/clinical-trials/overview'),
                            ('Personal Data Protection Act 2012', 'https://sso.agc.gov.sg/Act/PDPA2012')],
                'competitors': ['chubb.com/sg-en/business/industry-practices.html',
                                'aon.com/en-sg/industries',
                                'howdengroup.com/sg-en/sector',
                                'marsh.com/sg/industries.html']},
 'manufacturing': {'title': 'Manufacturing Insurance Singapore | TRS',
                   'description': 'Manufacturing insurance in Singapore: property, machinery breakdown, business interruption, product liability and WICA for '
                                  'factories.',
                   'intro': ['Manufacturers in Singapore buy insurance because a bank, a landlord, a customer or MOM requires it. A factory lease requires '
                             "fire cover; an equipment loan requires the lender named on the machinery policy; a customer's supply agreement requires product "
                             'liability and recall at a set limit. Every production worker does manual work under WICA, so work injury compensation is '
                             "compulsory regardless of pay. Manufacturing was 17.3 per cent of Singapore's GDP in 2024, and most of that value sits in plant "
                             'that cannot be replaced quickly.',
                             'The programme is not a shop package. Property covers buildings, plant and stock at reinstatement value; machinery breakdown '
                             'covers the internal electrical and mechanical failure that fire policies exclude; business interruption pays gross profit for an '
                             'indemnity period (the months the insurer keeps paying); products liability covers injury and damage from goods sold; stock '
                             'throughput follows raw material and finished goods in transit and storage. The gaps are usually plant valued at book rather than '
                             'replacement cost, an indemnity period shorter than the lead time for a replacement line, and a recall that nobody insured.'],
                   'risks': [('Factory fire',
                              'A fire in a dust-laden or solvent-using process destroys the line and the building. The sum insured was the depreciated book '
                              'value, and the average clause cuts the claim in proportion.',
                              'Property on an all-risks basis at full reinstatement value, with values reviewed after every capital purchase.'),
                             ('Machinery breakdown',
                              'A CNC centre, press or injection moulding machine fails from an internal electrical or mechanical fault. The fire policy '
                              "excludes it and the manufacturer's warranty has expired.",
                              'Machinery breakdown scheduled by machine at replacement value, with business interruption following breakdown as an extension.'),
                             ('Lost production',
                              'The line is down for six months while a replacement machine is built overseas. Rent, salaries and the loan continue, and the '
                              'customer moves the order.',
                              'Business interruption on gross profit with an indemnity period at least equal to the longest lead time, plus increased cost of '
                              'working for outsourced production.'),
                             ('Product liability and recall',
                              "A component fails in a customer's product and the customer recalls the whole batch. The supply agreement passes the recall cost "
                              'back to the manufacturer.',
                              'Products liability at the limit the supply agreement requires, with a recall expenses extension and the territory set to match '
                              'where the goods are sold.'),
                             ('Worker injury',
                              'An operator is injured at a press or during maintenance. For accidents from 1 November 2025, WICA compensation reaches '
                              'S$346,000 for permanent incapacity and S$269,000 for death.',
                              'Work injury compensation from an MOM-designated insurer for every manual worker, with the Work Permit medical policy and '
                              'security bond per foreign worker.'),
                             ('Stock in transit and storage',
                              'Imported raw material is damaged at sea, or finished goods are lost between the factory and the customer. Each leg sits with a '
                              'different carrier and a different limit.',
                              'Stock throughput covering raw material, work in progress and finished goods from supplier to customer, on one valuation '
                              'basis.')],
                   'programme': [('commercial/property',
                                  'Property at reinstatement value covers the factory, plant and stock, and satisfies the lease and the lender.'),
                                 ('commercial/equipment',
                                  'Machinery breakdown insures the internal failures of production equipment that the property policy excludes.'),
                                 ('commercial/revenue',
                                  'Business interruption pays the gross profit lost while damaged plant is replaced, for an indemnity period set to the '
                                  'longest lead time.'),
                                 ('commercial/core-liability',
                                  'Public and products liability answers injury and damage caused by goods sold, with recall expenses added where the supply '
                                  'contract requires.'),
                                 ('commercial/stock-throughput',
                                  'Stock throughput follows raw material and finished goods through transit and storage without a gap between cargo and '
                                  'property policies.'),
                                 ('commercial/workmen',
                                  'Production workers are manual workers, so WICA cover from a designated insurer is compulsory regardless of salary.')],
                   'faqs': [('Does fire insurance cover machinery breakdown?',
                             'No. Fire and property all-risks policies exclude loss caused by mechanical or electrical breakdown, even when the breakdown then '
                             'causes a fire that is covered. Breakdown needs its own machinery breakdown policy, scheduled by machine, and a business '
                             'interruption extension if lost output matters.'),
                            ('How is business interruption calculated?',
                             'On gross profit: turnover less the purchases and variable costs that stop when production stops. The insurer pays the reduction '
                             'in gross profit during the indemnity period, plus increased costs of working such as outsourcing or overtime. The sum insured is '
                             'the annual gross profit multiplied by the indemnity period in years, so a 24-month period needs twice the annual figure.'),
                            ('Do we need product recall cover separately?',
                             'Yes. Products liability pays third-party injury and damage after a defective product causes harm. It does not pay the cost of '
                             'withdrawing the product from the market, which a recall expenses extension or a standalone recall policy covers. Supply '
                             'agreements with larger customers often pass recall costs to the supplier, so the limit should match the contract.'),
                            ('Which employees must have WICA cover?',
                             'All employees doing manual work regardless of salary, and all non-manual employees earning S$2,600 or less a month, local or '
                             'foreign. From 1 January 2021 the policy must be from an MOM-designated insurer. Independent contractors are not covered. Failure '
                             'to insure carries a fine of up to S$10,000, jail of up to 12 months, or both.'),
                            ('What cover do Work Permit holders on the line need?',
                             'A medical policy of at least S$60,000 a year per worker, submitted before the permit is issued or renewed, and a S$5,000 '
                             'security bond for each non-Malaysian worker. For policies from 1 July 2023 the insurer pays 75 per cent and the employer 25 per '
                             'cent of claims above S$15,000. The cost cannot be passed to the worker. WICA cover applies on top.')],
                   'sources': [('SingStat, Singapore economy 2024 infographic',
                                'https://www.singstat.gov.sg/modules/infographics/-/media/Files/visualising_data/infographics/Economy/singapore-economy04042025.pdf'),
                               ('MOM, work injury compensation insurance',
                                'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance'),
                               ('MOM, types of compensation',
                                'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/types-of-compensation'),
                               ('MOM, Work Permit medical insurance',
                                'https://www.mom.gov.sg/passes-and-permits/work-permit-for-foreign-worker/sector-specific-rules/medical-insurance')],
                   'competitors': ['chubb.com/sg-en/business/manufacturing-industry.html',
                                   'lockton.com/apac/en/products-services/manufacturing',
                                   'aon.com/en-sg/industries',
                                   'howdengroup.com/sg-en/sector']},
 'professional-services': {'title': 'Professional Services Insurance Singapore | TRS',
                           'description': 'Professional services insurance in Singapore: PI, D&O, cyber and benefits for law, accounting, consulting and '
                                          'design firms.',
                           'intro': ['Professional firms in Singapore buy insurance because a regulator or a client engagement letter requires it. Law '
                                     'practices must hold professional indemnity of S$1 million for sole proprietors and partnerships and S$2 million for law '
                                     'corporations and LLPs under the Law Society scheme. Licensed financial advisers must hold S$1 million. Consultants, '
                                     'architects, engineers and accountants face the same demand from clients, whose procurement terms ask for a professional '
                                     'indemnity certificate before a contract is signed.',
                                     'The programme is not only professional indemnity. PI answers client claims for negligent advice, errors or missed '
                                     'deadlines. D&O answers claims against partners and directors as individuals. Cyber answers a breach of client files and '
                                     'the PDPA duties that follow. Group medical and benefits meet the employment contracts. PI and D&O are claims-made: the '
                                     'policy in force when the claim is made responds, for work after the retroactive date. The gaps are usually a retroactive '
                                     'date set at inception rather than founding, a per-claim limit that is also the annual aggregate, and no run-off when a '
                                     'partner leaves.'],
                           'risks': [('Negligent advice',
                                      'A client acts on a report, a valuation or a tax position that proves wrong and claims its loss. Defence costs start '
                                      'before liability is decided.',
                                      "Professional indemnity with defence costs in addition to the limit and a retroactive date at the firm's founding."),
                                     ('Missed deadline or lost document',
                                      "A filing is missed, a title deed or a client's original records are lost. The client claims the cost of reconstruction "
                                      'and the loss that followed.',
                                      'Professional indemnity with a loss of documents extension and a limit per claim that is not also the annual aggregate.'),
                                     ('Client data breach',
                                      'Client files are exfiltrated through a compromised mailbox. The PDPC must be notified within 3 calendar days once the '
                                      'breach is assessed as notifiable, and the penalty cap is 10 per cent of Singapore turnover.',
                                      'Cyber liability with breach response, notification and regulatory defence, at a limit sized to the number of client '
                                      'records held.'),
                                     ('Claim against a partner or director',
                                      'A regulator, a former partner or an employee brings a claim against an individual for a management decision rather than '
                                      'a professional act.',
                                      'D&O or management liability covering the partners and directors, with employment practices liability added for staff '
                                      'claims.'),
                                     ('Loss of a key partner',
                                      'The rainmaker or the sole signatory dies or is incapacitated. Fee income falls and the bank calls the overdraft.',
                                      "Keyman insurance on the named partners at a sum that funds the transition and the bank's requirement."),
                                     ('Staff attrition',
                                      'A competitor offers a richer benefits package and the associates move. Recruitment and ramp-up costs follow.',
                                      'Group medical, dental and term life on a schedule that matches the market the firm hires from.')],
                           'programme': [('commercial/professional',
                                          'Professional indemnity is the regulator and client requirement, placed at the Law Society, MAS or engagement letter '
                                          'minimum with the retroactive date at founding.'),
                                         ('commercial/dao',
                                          'D&O covers the partners and directors for management decisions, regulatory inquiries and employment claims.'),
                                         ('commercial/cyber', 'Cyber pays the breach response and PDPA costs when client files are exposed.'),
                                         ('employees/medical',
                                          'Group medical is in every professional employment contract and is the first item checked by a lateral hire.'),
                                         ('employees/benefits', 'Group term life and disability income complete the benefits schedule the firm competes on.'),
                                         ('employees/keyman',
                                          'Keyman insurance funds the firm through the loss of a partner the bank or the clients depend on.')],
                           'faqs': [('What professional indemnity limit does a Singapore law practice need?',
                                     'Under section 75A of the Legal Profession Act and the Law Society scheme, S$1 million for each and every claim for sole '
                                     'proprietorships and partnerships, and S$2 million for each and every claim for law corporations and limited liability '
                                     'law partnerships, inclusive of costs. The Law Society must be satisfied the cover is in place before a practising '
                                     'certificate is issued. Many firms buy top-up cover above the minimum.'),
                                    ('What does claims-made mean for my professional indemnity policy?',
                                     'The policy responds to claims first made against the firm during the policy period, regardless of when the work was '
                                     'done, as long as the work was after the retroactive date. A gap in cover resets the retroactive date and leaves earlier '
                                     "work uninsured. Renewing without a break keeps the original date, which should be the firm's founding date."),
                                    ('Do I need D&O if I am a small partnership?',
                                     'Professional indemnity covers professional acts. It does not cover claims against the partners for management decisions: '
                                     "a dispute with a departing partner, an employee claim for wrongful dismissal, a regulator's inquiry into the firm's "
                                     'accounts. D&O or management liability covers those. The need depends on headcount, the number of partners and the '
                                     'regulator, not on revenue.'),
                                    ('Does professional indemnity cover a data breach?',
                                     'Usually not. Professional indemnity covers claims by clients for negligent professional services. The costs of a breach '
                                     'are first-party: forensics, notification, legal advice on the PDPA, credit monitoring and regulatory defence. Cyber '
                                     'insurance covers those and the third-party claims that follow. Some PI wordings add a small cyber extension, which is '
                                     'rarely enough.'),
                                    ('What happens to cover when a partner retires?',
                                     "The firm's policy continues to cover work the partner did while at the firm, as long as the firm keeps renewing. If the "
                                     'firm closes or merges, run-off cover keeps the policy responding to claims for a set number of years. The Law Society '
                                     'scheme covers former practitioners of a law practice for work done there; other professions need run-off written into '
                                     'the policy.')],
                           'sources': [('Law Society of Singapore, compulsory professional indemnity insurance',
                                        'https://www.lawsociety.org.sg/support-schemes/professional-indemnity-insurance-scheme/'),
                                       ("MAS, financial adviser's licence requirements",
                                        'https://www.mas.gov.sg/regulation/capital-markets/financial-advisers-licence'),
                                       ('Personal Data Protection Act 2012', 'https://sso.agc.gov.sg/Act/PDPA2012'),
                                       ('PDPC, Guide on Managing and Notifying Data Breaches under the PDPA',
                                        'https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Other-Guides/Guide-on-Managing-and-Notifying-Data-Breaches-under-the-PDPA-15-Mar-2021.pdf')],
                           'competitors': ['aon.com/en-sg/industries',
                                           'howdengroup.com/sg-en/sector',
                                           'lockton.com/apac/en/products-services/technology-insurance',
                                           'marsh.com/sg/industries.html']},
 'tech-media-startups': {'title': 'Tech, Media and Startup Insurance Singapore | TRS',
                         'description': 'Tech and startup insurance in Singapore: tech E&O, cyber, D&O and benefits from seed to IPO, and what investors ask '
                                        'for at term sheet.',
                         'intro': ['Technology, media and start-up companies in Singapore buy insurance when an investor, an enterprise customer or a '
                                   'regulator asks. A term sheet asks for D&O before the round closes. An enterprise contract asks for technology errors and '
                                   'omissions and cyber at a stated limit before go-live. A media client asks for defamation and IP infringement cover. The '
                                   'PDPA requires a notifiable breach to be reported to the PDPC within 3 calendar days once assessed, with a penalty cap of '
                                   '10 per cent of Singapore turnover.',
                                   'The programme is not a single package. Technology E&O answers a customer claim that the software or service failed; cyber '
                                   'answers breach response, extortion and regulatory costs; D&O answers claims against founders and directors from investors, '
                                   'regulators or employees; group medical, keyman and business travel cover the team. E&O, cyber and D&O are claims-made and '
                                   'carry a retroactive date before which no work is covered. The gaps are usually a customer contract with limits above the '
                                   'policy, open-source and IP exclusions, and a D&O that stops at the Singapore entity while the parent is uninsured.'],
                         'risks': [('Software or service failure',
                                    'An outage or a defect costs an enterprise customer revenue and the customer claims under the contract. The limitation of '
                                    'liability clause is tested in court.',
                                    'Technology errors and omissions at the limit the largest customer contract requires, with contractual liability not '
                                    'excluded.'),
                                   ('Data breach or ransomware',
                                    'User data is exfiltrated or systems are encrypted. The PDPC must be notified within 3 calendar days once the breach is '
                                    'assessed as notifiable; a breach affecting 500 or more individuals is notifiable on scale alone.',
                                    'Cyber liability with breach response, extortion, business interruption and regulatory defence, at a limit sized to the '
                                    'user records held.'),
                                   ('Investor or shareholder claim',
                                    'A down round, a failed exit or a misstatement in the data room produces a claim against the founders and the board. The '
                                    'company cannot indemnify them until the claim is resolved.',
                                    'D&O with Side A cover for individuals and entity cover for securities claims, scheduled to include the holding company '
                                    'and every subsidiary.'),
                                   ('IP infringement or defamation',
                                    'A media piece, an advertisement or a feature is alleged to infringe a copyright or trademark, or to defame a person. '
                                    'Injunction and defence costs come first.',
                                    'Media liability or an intellectual property extension on the E&O policy, covering defence costs and damages for '
                                    'unintentional infringement.'),
                                   ('Founder death or disability',
                                    'A founder with the product knowledge or the investor relationships dies or is incapacitated. Investors trigger the key '
                                    'person clause.',
                                    "Keyman insurance on the named founders at a sum that funds the replacement period the shareholders' agreement allows."),
                                   ('Employee claim',
                                    'A dismissed employee alleges discrimination or wrongful termination. The claim names the founder personally.',
                                    'Employment practices liability as a section of the D&O or management liability policy, with defence costs for the company '
                                    'and the individual.')],
                         'programme': [('commercial/professional',
                                        'Technology E&O is the professional indemnity for software and services, placed at the limit enterprise contracts '
                                        'require.'),
                                       ('commercial/cyber',
                                        'Cyber pays breach response, extortion and regulatory defence under the PDPA, and is a condition of most enterprise '
                                        'contracts.'),
                                       ('commercial/dao',
                                        'D&O is asked for at term sheet and protects founders and directors through each round, with the holding company and '
                                        'subsidiaries scheduled.'),
                                       ('employees/medical',
                                        'Group medical is the first benefit candidates check and scales with headcount from the first hire.'),
                                       ('employees/keyman',
                                        'Keyman insurance funds the company through the loss of a founder the investors and the product depend on.'),
                                       ('employees/group-travel', 'Group business travel covers a team that sells and raises across the region.')],
                         'faqs': [('When should a start-up buy D&O?',
                                   "When the first outside investor joins the board, which is usually the seed or Series A term sheet. The investor's nominee "
                                   'director wants cover before taking the seat. The policy should name the holding company and every subsidiary, so a '
                                   'Singapore operating company with an overseas parent needs both scheduled. Limits rise with each round as the shareholder '
                                   'base and the claim exposure grow.'),
                                  ('What is the difference between technology E&O and cyber insurance?',
                                   'Technology E&O covers claims by customers that the product or service failed to perform: a bug, an outage, a missed '
                                   'specification. Cyber covers the costs of a security or privacy event: breach response, extortion, business interruption '
                                   'and regulatory action, plus claims by the people whose data was exposed. Many insurers combine both in one policy with a '
                                   'shared or separate limit.'),
                                  ('Does cyber insurance pay PDPA penalties?',
                                   'Most wordings cover regulatory defence costs and pay penalties where the law allows them to be insured. Whether a PDPC '
                                   'financial penalty is insurable in Singapore is not settled, so treat the penalty as uninsured and the defence and '
                                   'notification costs as insured. The penalty cap for contraventions from 1 October 2022 is 10 per cent of annual Singapore '
                                   'turnover where turnover exceeds S$10 million, or S$1 million otherwise.'),
                                  ('Can one policy cover our Singapore and overseas entities?',
                                   'Yes, if each entity is named and the territory and jurisdiction clauses cover where the claim can be brought. A policy '
                                   'limited to Singapore jurisdiction does not respond to a claim filed in a US court by a US customer. Enterprise contracts '
                                   "with overseas customers should be read against the policy's jurisdiction clause before signing."),
                                  ('What must we do after a data breach?',
                                   'Assess whether the breach is notifiable within 30 calendar days of discovering it. If it causes or is likely to cause '
                                   'significant harm, or affects 500 or more individuals, notify the PDPC within 3 calendar days of that assessment and notify '
                                   'affected individuals as soon as practicable. Cyber policies require the insurer to be told at the same time and provide '
                                   'the forensic and legal panel that handles the response.')],
                         'sources': [('Personal Data Protection Act 2012', 'https://sso.agc.gov.sg/Act/PDPA2012'),
                                     ('PDPC, Guide on Managing and Notifying Data Breaches under the PDPA',
                                      'https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Other-Guides/Guide-on-Managing-and-Notifying-Data-Breaches-under-the-PDPA-15-Mar-2021.pdf'),
                                     ('PDPC, required to notify the PDPC', 'https://www.pdpc.gov.sg/Report-Data-Breach/Before-You-Report-A-Data-Breach-3/Info'),
                                     ('MOM, work injury compensation insurance',
                                      'https://www.mom.gov.sg/workplace-safety-and-health/work-injury-compensation/work-injury-compensation-insurance')],
                         'competitors': ['lockton.com/apac/en/products-services/technology-insurance',
                                         'howdengroup.com/sg-en/sector',
                                         'aon.com/en-sg/industries',
                                         'chubb.com/sg-en/business/industry-practices.html']}}
