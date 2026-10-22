// HR Connect public pages: /connect/<token>. No dashboard shell (ConditionalShell exempts
// /connect/), no session (middleware PUBLIC_PATHS). The token in the URL is the credential.
import type { Metadata } from 'next'
import '../connect.css'
import { LinkProvider } from '@/components/hr-connect/link-context'
import { Frame } from '@/components/hr-connect/frame'

export const metadata: Metadata = {
  title: 'Employee list · Trade Risk Solutions',
  robots: { index: false, follow: false },
}

export default async function ConnectLayout(props: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const params = await props.params;

  const {
    children
  } = props;

  return (
    <LinkProvider token={params.token}>
      <Frame>{children}</Frame>
    </LinkProvider>
  )
}
