import { redirect } from 'next/navigation'

/** Insurers is the second tab of Contacts since 30 Oct 2026. */
export default function InsurersPage() {
  redirect('/companies?kind=insurer')
}
