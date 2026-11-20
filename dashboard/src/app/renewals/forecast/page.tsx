import { RenewalsForecast } from '@/components/renewals/RenewalsForecast'

export const dynamic = 'force-dynamic'

/** Renewals › Forecast: due, won, open and lost by month for 12 months (docs/renewals.md, release 2). */
export default function RenewalsForecastPage() {
  return <RenewalsForecast />
}
