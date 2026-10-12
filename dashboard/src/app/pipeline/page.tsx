import { redirect } from 'next/navigation'

// The Apollo/Instantly pipeline was retired on 12 Oct 2026. Sales lives at /sales.
export default function PipelinePage() {
  redirect('/sales/leads')
}
