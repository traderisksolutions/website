// Server actions on these pages take their time limit from here: the endorsement request (300 s)
// and raising a debit note from an insurer's note (200 s) were routes with those limits.
export const maxDuration = 300

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
