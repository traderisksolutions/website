'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SubProduct = {
  id: string
  name: string
  caption: string
}

type Category = {
  id: string
  title: string
  description: string
  products: SubProduct[]
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    id: 'personal',
    title: 'Personal',
    description:
      'Comprehensive protection for you and your family. Secure your peace of mind with tailored home contents, fire, travel, maid, and personal accident insurance.',
    products: [
      {
        id: 'home-contents',
        name: 'Home Contents',
        caption:
          'Secure your furniture, electronics, and renovations with comprehensive coverage built to protect your sanctuary from unexpected damage or loss.',
      },
      {
        id: 'fire-insurance',
        name: 'Fire Insurance',
        caption:
          "Safeguard your property's physical foundation and original fixtures against catastrophic structural damage, explosions, and severe weather events.",
      },
      {
        id: 'travel-insurance',
        name: 'Travel Insurance',
        caption:
          'Explore the world with absolute confidence while fully covered for international medical emergencies, trip cancellations, and luggage disruptions.',
      },
      {
        id: 'maid-insurance',
        name: 'Maid Insurance',
        caption:
          'Fulfill your statutory obligations while providing top-tier medical security and liability protection for those who look after your household.',
      },
      {
        id: 'personal-accident',
        name: 'Personal Accident',
        caption:
          'Build a reliable financial safety net that provides immediate lump-sum payouts and expense reimbursements if life takes an unpredictable turn.',
      },
    ],
  },
  {
    id: 'business',
    title: 'Business',
    description:
      'Strategic risk management for your enterprise assets, operations, and reputation. Total coverage spans property, specialized liability, cyber, marine, and commercial fleet programmes.',
    products: [
      {
        id: 'business-property',
        name: 'Business Property',
        caption:
          'Protect your commercial buildings, operational infrastructure, and physical stock from catastrophic material damage, fire, and severe weather events.',
      },
      {
        id: 'equipment-breakdown',
        name: 'Equipment Breakdown',
        caption:
          'Guard your core operations against severe financial losses and unexpected downtime caused by the sudden mechanical or electrical failure of critical machinery.',
      },
      {
        id: 'marine-cargo',
        name: 'Marine Cargo',
        caption:
          'Secure your commercial freight, raw materials, and commodities across international supply chains with robust coverage against transit damage, theft, and loss.',
      },
      {
        id: 'commercial-motor',
        name: 'Commercial Motor',
        caption:
          'Safeguard the entire fleet driving your business forward with comprehensive physical damage protection and unlimited third-party road liability coverage.',
      },
      {
        id: 'general-liability',
        name: 'General Liability',
        caption:
          'Shield your business against costly litigation arising from accidental third-party bodily injury, property damage, or defects in your distributed products.',
      },
      {
        id: 'professional-indemnity',
        name: 'Professional Indemnity',
        caption:
          'Defend your institutional expertise and commercial consultancy against high-stakes client lawsuits alleging professional negligence, design errors, or financial omissions.',
      },
      {
        id: 'directors-officers',
        name: 'Directors & Officers',
        caption:
          'Insulate the personal wealth and assets of your board members and senior executives against complex regulatory investigations and stakeholder mismanagement claims.',
      },
      {
        id: 'cyber-insurance',
        name: 'Cyber Insurance',
        caption:
          'Build immediate corporate resilience against data breaches, ransomware extortion, and systemic network outages while covering regulatory penalties and recovery costs.',
      },
    ],
  },
  {
    id: 'workforce',
    title: 'Workforce',
    description:
      'Group health, executive benefits, and corporate wellness structures designed to attract elite talent while ensuring your company remains fully MOM-compliant.',
    products: [
      {
        id: 'group-medical',
        name: 'Group Medical',
        caption:
          'Provide comprehensive hospitalization and outpatient coverage for your team to attract premium talent and ensure your workforce stays protected and productive.',
      },
      {
        id: 'work-injury-wica',
        name: 'Work Injury (WICA)',
        caption:
          'Fulfill your mandatory legal obligations with robust coverage that protects your enterprise from common law claims while securing fair compensation for your staff.',
      },
      {
        id: 'group-term-life',
        name: 'Group Term Life',
        caption:
          'Establish a meaningful safety net for your employees by providing substantial lump-sum financial protection for their families in times of critical need.',
      },
      {
        id: 'personal-accident',
        name: 'Personal Accident',
        caption:
          'Protect your team round-the-clock with worldwide accidental injury coverage, medical expense reimbursements, and clear permanent disablement benefits.',
      },
    ],
  },
  {
    id: 'api',
    title: 'API',
    description:
      'Seamlessly integrate contextual white-label insurance coverage directly into your native digital platform, fully powered by scalable TRS infrastructure.',
    products: [
      {
        id: 'embedded-insurance',
        name: 'Embedded Insurance',
        caption:
          'Integrate contextual insurance solutions directly into your native digital platform to deliver real-time coverage at the exact point of need, fully powered by licensed TRS infrastructure.',
      },
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhatWeCover() {
  const [activeCatId, setActiveCatId] = useState<string>('personal')
  const [activeProdId, setActiveProdId] = useState<string>('home-contents')

  const category = CATEGORIES.find((c) => c.id === activeCatId)!
  const product =
    category.products.find((p) => p.id === activeProdId) ?? category.products[0]

  function switchCategory(catId: string) {
    const cat = CATEGORIES.find((c) => c.id === catId)!
    setActiveCatId(catId)
    setActiveProdId(cat.products[0].id)
  }

  return (
    <section className="max-w-[1120px] mx-auto px-6 md:px-12 py-24">

      {/* ── Header ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-12">
        <div className="md:col-span-6">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-neutral-400 mb-4">
            What we cover
          </p>
          <h2 className="font-serif text-4xl font-normal tracking-tight text-neutral-900 leading-[1.1]">
            Insurance built for every stage of life and business
          </h2>
        </div>
        <div className="md:col-span-6 md:flex md:items-end">
          <p className="text-[15px] leading-relaxed text-neutral-500">
            Whether you are protecting your family, scaling a startup, managing a large enterprise,
            or embedding digital coverage directly into your platform, TRS structures the right risk
            solutions powered by Singapore&apos;s leading institutional insurers.
          </p>
        </div>
      </div>

      {/* ── 4 Macro category cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => switchCategory(cat.id)}
            className={[
              'text-left p-6 rounded-2xl border-[1.5px] transition-all duration-300 ease-in-out',
              activeCatId === cat.id
                ? 'bg-white border-neutral-900 shadow-md ring-1 ring-neutral-900'
                : 'bg-neutral-100/60 border-transparent hover:bg-neutral-100',
            ].join(' ')}
          >
            <p className="text-[15px] font-semibold text-neutral-900 mb-2">{cat.title}</p>
            <p className="text-[13px] text-neutral-500 leading-relaxed">{cat.description}</p>
          </button>
        ))}
      </div>

      {/* ── Sub-product drawer ── */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 transition-all duration-300 ease-in-out">

        {/* Pill nav */}
        <div className="flex flex-wrap gap-2 mb-6">
          {category.products.map((prod) => (
            <button
              key={prod.id}
              onClick={() => setActiveProdId(prod.id)}
              className={[
                'px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ease-in-out',
                activeProdId === prod.id
                  ? 'bg-neutral-950 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700',
              ].join(' ')}
            >
              {prod.name}
            </button>
          ))}
        </div>

        {/* Product detail */}
        <div className="pt-5 border-t border-neutral-100 transition-all duration-300 ease-in-out">
          <p className="text-[11px] font-medium tracking-widest uppercase text-neutral-400 mb-3">
            {category.title} / {product.name}
          </p>
          <h3 className="text-xl font-semibold text-neutral-900 mb-3">{product.name}</h3>
          <p className="text-[15px] text-neutral-500 leading-relaxed max-w-2xl">
            {product.caption}
          </p>
        </div>

      </div>
    </section>
  )
}
