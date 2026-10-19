// One place for the site's identity. Used by metadata, robots, sitemap, header and footer.
// Contact details as published on corporatecover.sg.
export const site = {
  name: "Corp Cover",
  domain: "corpcover.com",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://corpcover.com",
  description: "Plain guides, policy reviews and independent advisers for Singapore companies. Insurers pay the advisers; your business pays no fee.",
  email: "support@corporatecover.sg",
  phone: "8774 7769",
  address: "10 Anson Road, #33-03 International Plaza, Singapore 079903",
};

export const reviewHref = `mailto:${site.email}?subject=${encodeURIComponent("Business insurance quotes")}`;
