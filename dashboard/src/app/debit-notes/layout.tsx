// The debit note pages are client pages; their server actions take their time limit from here.
// Reading an imported bundle was a 180 s route.
export const maxDuration = 180

export default function DebitNotesLayout({ children }: { children: React.ReactNode }) {
  return children
}
