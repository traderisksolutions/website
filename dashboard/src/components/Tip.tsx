'use client'
import { Tooltip } from 'antd'
import { HelpCircle } from 'lucide-react'

export function Tip({ text, placement = 'top', width = 260 }: {
  text:       string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  /** Wider for a note of several sentences. */
  width?:     number
}) {
  return (
    <Tooltip
      title={text}
      placement={placement}
      styles={{ container: { fontSize: 12, maxWidth: width, lineHeight: 1.55 } }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', cursor: 'help',
        color: '#8c958f', marginLeft: 4, verticalAlign: 'middle', lineHeight: 1,
      }}>
        <HelpCircle size={12} />
      </span>
    </Tooltip>
  )
}
