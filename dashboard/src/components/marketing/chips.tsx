'use client'

import { Chip } from '@/components/crm/primitives'
import { ARTICLE_STATUS_LABEL, CATEGORY_LABEL, GSC_STATUS_LABEL, NODE_STATUS_LABEL, RUN_STATUS_LABEL } from '@/lib/marketing/labels'

// State is a word in a neutral chip, never a colour (house rule).
export const ArticleStatusChip = ({ status }: { status: string }) => <Chip>{ARTICLE_STATUS_LABEL[status] ?? status}</Chip>
export const CategoryChip = ({ category }: { category: string }) => <Chip>{CATEGORY_LABEL[category] ?? category}</Chip>
export const RunStatusChip = ({ status }: { status: string }) => <Chip>{RUN_STATUS_LABEL[status] ?? status}</Chip>
export const NodeStatusChip = ({ status }: { status: string }) => <Chip>{NODE_STATUS_LABEL[status] ?? status}</Chip>
export const GscStatusChip = ({ status }: { status: string }) => <Chip>{GSC_STATUS_LABEL[status] ?? status}</Chip>
export const KnowledgeStatusChip = ({ status }: { status: string }) => <Chip>{status === 'verified' ? 'Verified' : status === 'archived' ? 'Archived' : 'Draft'}</Chip>
export const GateChip = ({ passed }: { passed: boolean | null | undefined }) => (passed == null ? <span style={{ color: '#9aa0a6' }}>–</span> : <Chip>{passed ? 'Gate passed' : 'Held by gate'}</Chip>)
