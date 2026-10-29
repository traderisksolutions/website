// One place for the site's identity. Used by metadata, robots, sitemap, header and footer.
// Values in square brackets are not yet supplied by the client and render as visible gaps.
export const site = {
  name: "New South Sea",
  nameZh: "新南海（香港）有限公司",
  domain: "newsouthsea.com",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.newsouthsea.com",
  description: "Complex business risks, placed and claimed. Property, liability, D&O, cyber and marine programmes, handled by the same broker through to claim.",
  email: "[enquiries email]",
  claimsEmail: "[claims email]",
  phone: "[+852 phone]",
  address: "[Office address, Hong Kong]",
  hours: "Monday to Friday, 9:00 to 18:00 HKT",
  licence: "[IA broker licence no.]",
  entity: "New South Sea (HK) Limited",
};
