import { redirect } from 'next/navigation'

/** Team lives under Settings now. */
export default function TeamPage() {
  redirect('/settings?section=team')
}
