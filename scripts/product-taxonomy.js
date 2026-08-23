/* ── Canonical product-line taxonomy ──────────────────────────────────────────
   Mirrors dashboard/src/lib/product-lines.ts exactly (same slugs, labels, groups,
   sections) so a lead captured here carries a `product_line` slug the dashboard
   can use directly, instead of guessing from a free-text topic label.
   Keep these two files in sync by hand — this static site has no build step to
   share TypeScript across repos. ── */
(function () {
  var PRODUCT_GROUPS = [
    { key: 'assets',      label: 'Business — Assets' },
    { key: 'liabilities', label: 'Business — Liabilities' },
    { key: 'workforce',   label: 'Workforce' }
  ];

  var PRODUCT_LINES = [
    // Business — Assets
    { slug: 'iar_fire',              label: 'Industrial All Risk (IAR) & Fire', group: 'assets', section: 'Property & Business' },
    { slug: 'business_interruption', label: 'Business Interruption (BI)',        group: 'assets', section: 'Property & Business' },
    { slug: 'construction_car',      label: "Contractors' All Risks (CAR)",      group: 'assets', section: 'Engineering & Construction' },
    { slug: 'machinery_breakdown',   label: 'Machinery Breakdown',               group: 'assets', section: 'Engineering & Construction' },
    { slug: 'electronic_equipment',  label: 'Electronic Equipment Insurance',    group: 'assets', section: 'Engineering & Construction' },
    { slug: 'commercial_vehicle',    label: 'Commercial Vehicle Insurance',      group: 'assets', section: 'Commercial Motor' },
    { slug: 'marine_cargo',          label: 'Marine Cargo',                      group: 'assets', section: 'Marine, Stock & Logistics' },
    { slug: 'stock_throughput',      label: 'Stock Throughput',                  group: 'assets', section: 'Marine, Stock & Logistics' },
    { slug: 'inland_transit',        label: 'Inland Transit',                    group: 'assets', section: 'Marine, Stock & Logistics' },
    { slug: 'trade_credit',          label: 'Trade Credit',                      group: 'assets', section: 'Trade Credit & Bonds' },
    { slug: 'surety_bonds',          label: 'Surety Bonds',                      group: 'assets', section: 'Trade Credit & Bonds' },

    // Business — Liabilities
    { slug: 'general_liability',       label: 'General Comprehensive Liability',       group: 'liabilities', section: 'General Liability' },
    { slug: 'professional_indemnity',  label: 'Professional Indemnity (PI)',           group: 'liabilities', section: 'Professional & Management' },
    { slug: 'do',                      label: 'Directors & Officers (D&O)',            group: 'liabilities', section: 'Professional & Management' },
    { slug: 'imi',                     label: 'Investment Management Insurance (IMI)', group: 'liabilities', section: 'Professional & Management' },
    { slug: 'environmental_liability', label: 'Environmental Liability',               group: 'liabilities', section: 'Environmental Liability' },
    { slug: 'medical_malpractice',     label: 'Medical Malpractice Insurance',         group: 'liabilities', section: 'Medical' },
    { slug: 'cyber',                   label: 'Cyber Insurance',                       group: 'liabilities', section: 'Cyber' },

    // Workforce
    { slug: 'wica',                   label: 'Work Injury Compensation (WICA)',  group: 'workforce', section: 'Workers' },
    { slug: 'foreign_worker_medical', label: 'Foreign Worker Medical Insurance', group: 'workforce', section: 'Workers' },
    { slug: 'foreign_worker_bond',    label: 'Foreign Worker Bond Insurance',    group: 'workforce', section: 'Workers' },
    { slug: 'group_health',           label: 'Group Health Insurance',           group: 'workforce', section: 'Employees' },
    { slug: 'group_travel',           label: 'Group Business Travel',            group: 'workforce', section: 'Employees' },
    { slug: 'employee_benefits',      label: 'Employee Benefits Insurance',      group: 'workforce', section: 'Employees' },
    { slug: 'keyman',                 label: 'Keyman Insurance',                 group: 'workforce', section: 'Executive' }
  ];

  function grouped() {
    return PRODUCT_GROUPS.map(function (g) {
      var lines = PRODUCT_LINES.filter(function (l) { return l.group === g.key; });
      var sections = [];
      lines.forEach(function (l) {
        var s = null;
        for (var i = 0; i < sections.length; i++) { if (sections[i].section === l.section) { s = sections[i]; break; } }
        if (!s) { s = { section: l.section, lines: [] }; sections.push(s); }
        s.lines.push(l);
      });
      return { key: g.key, label: g.label, sections: sections };
    });
  }

  window.TRS_PRODUCT_TAXONOMY = {
    groups: PRODUCT_GROUPS,
    lines:  PRODUCT_LINES,
    grouped: grouped,
    labelForSlug: function (slug) {
      for (var i = 0; i < PRODUCT_LINES.length; i++) { if (PRODUCT_LINES[i].slug === slug) return PRODUCT_LINES[i].label; }
      return slug;
    }
  };
})();
