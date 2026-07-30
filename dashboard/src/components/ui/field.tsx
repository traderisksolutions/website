/** A permanent uppercase label above a form control — never a placeholder, which disappears
 *  the moment a value (or an AI-extracted value) is filled in and leaves no way to tell which
 *  field is which. */
export function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      {children}
    </label>
  )
}
