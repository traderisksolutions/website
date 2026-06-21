// Phase 3: /documentation now redirects to /overview.
// The educational hub has moved to /overview.
// This preserves any existing bookmarks or direct links.
import { redirect } from 'next/navigation'

export default function DocumentationRedirect() {
  redirect('/overview')
}
