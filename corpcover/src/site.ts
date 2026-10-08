// One place for the site's identity. Used by metadata, robots, sitemap, header and footer.
export const site = {
  name: "Corp Cover",
  domain: "corpcover.com",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://corpcover.com",
  description: "Business insurance for Singapore companies: what the law requires, what contracts require, and what each policy pays.",
  // Assumption: inbox not confirmed yet. Every "Request a review" link reads from here.
  email: "hello@corpcover.com",
};

export const reviewHref = `mailto:${site.email}?subject=${encodeURIComponent("Insurance review request")}`;
