// Rendered article HTML inside the dashboard, styled like the sites' article bodies.
import { cn } from '@/lib/utils'

const PROSE = [
  'text-[15px] leading-[1.65] text-[#0f1412] max-w-[720px]',
  '[&_h1]:text-[24px] [&_h1]:font-medium [&_h1]:tracking-[-0.02em] [&_h1]:mt-0 [&_h1]:mb-3',
  '[&_h2]:text-[19px] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:mt-8 [&_h2]:mb-2',
  '[&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-1.5',
  '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[#0f1412] [&_blockquote]:pl-4 [&_blockquote]:text-[#4a5550]',
  '[&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:font-medium [&_th]:border-b [&_th]:border-[#e6e8e4] [&_th]:py-1.5 [&_th]:pr-3 [&_td]:border-b [&_td]:border-[#e6e8e4] [&_td]:py-1.5 [&_td]:pr-3 [&_td]:align-top',
  '[&_pre]:my-3 [&_pre]:rounded-[10px] [&_pre]:bg-[#f1f2ee] [&_pre]:p-3 [&_pre]:text-[13px] [&_code]:font-mono [&_code]:text-[13px]',
  '[&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#e6e8e4]',
  '[&_.footnotes]:mt-8 [&_.footnotes]:pt-4 [&_.footnotes]:border-t [&_.footnotes]:border-[#e6e8e4] [&_.footnotes]:text-[13px] [&_.footnotes]:text-[#4a5550] [&_sup]:text-[11px]',
].join(' ')

export function Prose({ html, className }: { html: string; className?: string }) {
  return <div className={cn(PROSE, className)} dangerouslySetInnerHTML={{ __html: html }} />
}
