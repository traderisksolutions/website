'use client'

import 'reactflow/dist/style.css'

import { useState, useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from 'reactflow'
import Link from 'next/link'
import { X, ArrowUpRight, BookOpen } from 'lucide-react'
import WorkflowNode from './WorkflowNode'
import { WORKFLOW_NODES, WORKFLOW_EDGES, type WFNode } from './workflowData'

// ── Convert to React Flow format (stable references outside component) ──────────

const RF_INITIAL_NODES: Node[] = WORKFLOW_NODES.map(n => ({
  id: n.id,
  type: 'workflowNode',
  position: n.position,
  data: n,
  draggable: false,
  selectable: true,
}))

const RF_INITIAL_EDGES: Edge[] = WORKFLOW_EDGES.map(e => ({
  id: e.id,
  source: e.source,
  target: e.target,
  label: e.label,
  type: 'smoothstep',
  style: { stroke: 'rgba(20,30,50,0.18)', strokeWidth: 1.5 },
  labelStyle: { fontSize: 10, fill: '#667085', fontFamily: 'inherit' },
  labelBgStyle: { fill: '#f7f8fa', fillOpacity: 0.95 },
  labelBgPadding: [4, 3] as [number, number],
  labelBgBorderRadius: 3,
}))

const NODE_TYPES: NodeTypes = { workflowNode: WorkflowNode }

// ── Canvas ────────────────────────────────────────────────────────────────────

export default function WorkflowCanvas() {
  const [nodes, , onNodesChange] = useNodesState(RF_INITIAL_NODES)
  const [edges, , onEdgesChange] = useEdgesState(RF_INITIAL_EDGES)
  const [selectedNode, setSelectedNode] = useState<WFNode | null>(null)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as WFNode)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Apply selected state to nodes so custom node can style itself
  const styledNodes = useMemo(
    () => nodes.map(n => ({ ...n, selected: n.id === selectedNode?.id })),
    [nodes, selectedNode],
  )

  return (
    <div className="flex flex-col sm:flex-row h-full">
      {/* React Flow canvas — takes remaining space */}
      <div className="flex-1 min-h-0 min-w-0">
        <ReactFlow
          nodes={styledNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 0.95 }}
          minZoom={0.3}
          maxZoom={1.5}
          panOnScroll
          zoomOnPinch
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          selectionKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1}
            color="rgba(20,30,50,0.08)"
          />
          <Controls
            showInteractive={false}
            style={{
              boxShadow: '0 1px 4px rgba(20,30,50,0.10)',
              borderRadius: 8,
              border: '1px solid rgba(20,30,50,0.10)',
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail panel — right column on desktop, bottom strip on mobile */}
      <div
        className={[
          'flex-shrink-0 overflow-y-auto bg-card',
          'border-t border-[--border-subtle] sm:border-t-0 sm:border-l border-[--border-subtle]',
          // Desktop: fixed 288px column, fills flex row height automatically
          'sm:w-72',
          // Mobile: full width, collapses to 56px when nothing selected
          selectedNode ? 'h-[50vh] sm:h-auto' : 'h-0 sm:h-auto',
          'transition-[height] duration-200 ease-out',
        ].join(' ')}
      >
        {selectedNode ? (
          <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        ) : (
          <EmptyPanel />
        )}
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: WFNode; onClose: () => void }) {
  const d = node.detail

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="flex items-start justify-between gap-2 px-4 py-4 border-b border-[--border-subtle] bg-card sticky top-0 z-10 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/55 mb-1 m-0">
            {d.stage}
          </p>
          <h3 className="text-[13px] font-bold text-foreground leading-tight m-0 pr-2">
            {node.label}
          </h3>
          {node.sublabel && (
            <p className="text-[10.5px] text-muted-foreground mt-0.5 m-0 leading-snug">
              {node.sublabel}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground border-0 bg-transparent cursor-pointer"
          aria-label="Close detail panel"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="p-4 flex flex-col gap-3.5 overflow-y-auto flex-1">
        {/* Description */}
        <p className="text-[12.5px] text-foreground/75 leading-[1.7] m-0">
          {d.description}
        </p>

        {d.ai && (
          <DetailSection color="purple" label="What AI does here">
            {d.ai}
          </DetailSection>
        )}
        {d.human && (
          <DetailSection color="amber" label="What you do here">
            {d.human}
          </DetailSection>
        )}
        {d.outcome && (
          <DetailSection color="green" label="Outcome">
            {d.outcome}
          </DetailSection>
        )}

        {d.note && (
          <div
            className="rounded-lg px-3 py-2.5"
            style={{
              background: 'rgba(20,30,50,0.04)',
              border: '1px solid rgba(20,30,50,0.11)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-foreground/50 mb-1.5 m-0">
              Note
            </p>
            <p className="text-[12px] text-foreground/70 leading-relaxed m-0">
              {d.note}
            </p>
          </div>
        )}

        {/* App / docs links */}
        {(d.appLink || d.docsLink) && (
          <div className="flex flex-col gap-1.5 pt-1">
            {d.appLink && (
              <Link
                href={d.appLink.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold no-underline transition-colors"
                style={{ background: 'rgba(15,61,145,0.07)', color: '#0F3D91' }}
              >
                <ArrowUpRight size={13} strokeWidth={2} className="flex-shrink-0" />
                {d.appLink.label}
              </Link>
            )}
            {d.docsLink && (
              <Link
                href={d.docsLink.href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium no-underline transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <BookOpen size={12} strokeWidth={1.8} className="flex-shrink-0" />
                {d.docsLink.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyPanel() {
  return (
    <div className="h-full flex items-center justify-center px-6 py-8 sm:py-0">
      <p className="text-[12px] text-muted-foreground/45 leading-relaxed text-center">
        Click any node to see what happens at that step.
      </p>
    </div>
  )
}

function DetailSection({
  color,
  label,
  children,
}: {
  color: 'purple' | 'amber' | 'green'
  label: string
  children: string
}) {
  const s = {
    purple: { bg: 'rgba(124,58,237,0.05)', border: 'rgba(124,58,237,0.18)', accent: '#7c3aed' },
    amber:  { bg: 'rgba(194,122,7,0.05)',  border: 'rgba(194,122,7,0.20)',  accent: '#C27A07' },
    green:  { bg: 'rgba(15,138,95,0.05)',  border: 'rgba(15,138,95,0.18)', accent: '#0F8A5F' },
  }[color]

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.border}`,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.07em] mb-1.5 m-0"
        style={{ color: s.accent }}
      >
        {label}
      </p>
      <p className="text-[12px] leading-[1.65] m-0" style={{ color: 'rgba(16,24,40,0.75)' }}>
        {children}
      </p>
    </div>
  )
}
