/** Pricing Matrix uses a white content background (vs the dashboard's grey theme) for a calmer,
 *  higher-legibility workspace. Scoped to /pricing-matrix/* only. */
export default function PricingMatrixLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 bg-white text-slate-900">{children}</div>
}
