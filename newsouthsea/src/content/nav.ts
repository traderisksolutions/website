import { FAMILIES, LINES } from "./coverage";
import { INDUSTRIES } from "./industries";

export const COVERAGE_MENU = FAMILIES.map(family => ({
  family,
  lines: LINES.filter(l => l.family === family).map(l => ({ href: `/coverage/${l.slug}`, label: l.name })),
}));

export const INDUSTRY_MENU = INDUSTRIES.map(i => ({ href: `/industries/${i.slug}`, label: i.name }));

export const PLAIN_LINKS = [
  { href: "/how-we-work", label: "How we work" },
  { href: "/claims", label: "Claims" },
  { href: "/about", label: "About" },
];
