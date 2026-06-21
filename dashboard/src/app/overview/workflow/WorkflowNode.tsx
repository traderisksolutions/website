'use client'

import { Handle, Position } from 'reactflow'
import type { NodeKind } from './workflowData'

const KIND_META: Record<NodeKind, { dot: string; border: string; bg: string; tag: string }> = {
  trigger: {
    dot:    '#0F3D91',
    border: 'rgba(15,61,145,0.30)',
    bg:     'rgba(15,61,145,0.05)',
    tag:    'START',
  },
  ai: {
    dot:    '#7c3aed',
    border: 'rgba(124,58,237,0.28)',
    bg:     'rgba(124,58,237,0.05)',
    tag:    'AI',
  },
  human: {
    dot:    '#C27A07',
    border: 'rgba(194,122,7,0.30)',
    bg:     'rgba(194,122,7,0.05)',
    tag:    'HUMAN',
  },
  data: {
    dot:    '#0F8A5F',
    border: 'rgba(15,138,95,0.28)',
    bg:     'rgba(15,138,95,0.05)',
    tag:    'DATA',
  },
  output: {
    dot:    '#667085',
    border: 'rgba(20,30,50,0.22)',
    bg:     'rgba(20,30,50,0.04)',
    tag:    'OUTPUT',
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function WorkflowNode({ data, selected }: { data: any; selected: boolean }) {
  const m = KIND_META[data.kind as NodeKind] ?? KIND_META.output

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />

      <div
        style={{
          width: 168,
          background: selected ? '#ffffff' : m.bg,
          border: `1.5px solid ${selected ? m.dot : m.border}`,
          borderRadius: 8,
          padding: '9px 12px 10px',
          boxShadow: selected
            ? `0 0 0 3px ${m.dot}22, 0 2px 10px rgba(20,30,50,0.12)`
            : '0 1px 3px rgba(20,30,50,0.06)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'border-color 0.12s, box-shadow 0.12s, background 0.12s',
        }}
      >
        {/* Kind tag row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: m.dot, flexShrink: 0, display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: m.dot, lineHeight: 1,
            }}
          >
            {m.tag}
          </span>
        </div>

        {/* Label */}
        <p
          style={{
            fontSize: 12, fontWeight: 600,
            color: '#101828', margin: 0,
            lineHeight: 1.35, letterSpacing: '-0.01em',
          }}
        >
          {data.label}
        </p>

        {/* Sublabel */}
        {data.sublabel && (
          <p
            style={{
              fontSize: 10, color: '#667085',
              margin: '3px 0 0', lineHeight: 1.3,
            }}
          >
            {data.sublabel}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
    </>
  )
}
