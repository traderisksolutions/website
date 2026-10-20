// The short quote request on the home page: three steps, modelled on the request-for-quote form
// business owners already know. Liability and asset cover first. Shared by the form and its route.

export const COVER_GROUPS: { name: string; items: string[] }[] = [
  { name: "Liability", items: ["Public liability", "Product liability", "Professional indemnity", "Directors and officers", "Cyber liability", "Work injury compensation"] },
  { name: "Assets", items: ["Commercial property and fire", "Business all risks", "Business interruption", "Contractor's all risks", "Machinery breakdown", "Goods in transit and marine cargo"] },
  { name: "Other", items: ["Something else"] },
];
export const COVERS = COVER_GROUPS.flatMap(g => g.items);
export const ROLES = ["Owner or director", "Manager", "Employee"];

export type QuoteInput = {
  id: string; company: string; uen?: string; cover: string[];
  firstName: string; lastName: string; role: string; email: string; cc: string; phone: string;
  neededBy: string; details?: string; consent: boolean; sourceUrl?: string;
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UEN_RE = /^[0-9A-Z]{9,10}$/i;
