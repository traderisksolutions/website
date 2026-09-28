/** A permanent label above a form control — never a placeholder, which disappears the moment
 *  a value (or an AI-extracted value) is filled in and leaves no way to tell which field is
 *  which. Sentence case, small, grey: the same label every form in the dashboard uses. */
export function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-[12.5px] text-[#5f6368]">{label}</span>
      {children}
    </label>
  )
}
