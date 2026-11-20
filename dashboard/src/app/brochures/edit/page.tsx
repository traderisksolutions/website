import { VersionPage } from '@/components/brochures/BrochureLibrary'

export const dynamic = 'force-dynamic'

/** Employment Benefits › Brochures › one version's line, date, note and files: a full page. ?key=<library row key>. */
export default async function EditVersionPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
  return <VersionPage rowKey={typeof key === 'string' && key ? key.slice(0, 300) : ''} />
}
