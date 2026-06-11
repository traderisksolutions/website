'use client'
import { Tooltip } from 'antd'
import { HelpCircle } from 'lucide-react'

export function Tip({ text, placement = 'top' }: {
  text:       string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
}) {
  return (
    <Tooltip
      title={text}
      placement={placement}
      overlayInnerStyle={{ fontSize: 12, maxWidth: 260, lineHeight: 1.55 }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', cursor: 'help',
        color: '#c9cfd8', marginLeft: 4, verticalAlign: 'middle', lineHeight: 1,
      }}>
        <HelpCircle size={12} />
      </span>
    </Tooltip>
  )
}
