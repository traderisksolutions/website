import { redirect } from 'next/navigation'

/** One client's Nexus lives on the company page now (20 Nov 2026): old links land on its Nexus tab. */
export default async function CompanyNexusRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/companies/${encodeURIComponent(id)}?tab=nexus`)
}
