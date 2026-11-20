// The page is a client page; its server actions take their time limit from here. Reading domains
// and merging companies were 300 s and 120 s routes.
export const maxDuration = 300

export default function TriageLayout({ children }: { children: React.ReactNode }) {
  return children
}
