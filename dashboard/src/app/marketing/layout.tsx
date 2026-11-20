// Marketing's pages are client pages; their server actions take their time limit from here. The
// newsletter send and the Search Console sync were 60 s routes.
export const maxDuration = 60

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children
}
