'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Card, Statistic, Button, Flex, Typography, Table, Tag, Progress, Alert,
  Row, Col, Tooltip,
} from 'antd'
import { ReloadOutlined, FileTextOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

// ── Types ─────────────────────────────────────────────────────────────────────

type KnowledgeFile = {
  id:              string
  name:            string
  mimeType:        string
  sizeBytes:       number
  estimatedTokens: number
  modifiedTime:    string
}

type Stats = {
  files:              KnowledgeFile[]
  totalFiles:         number
  totalSizeBytes:     number
  totalTokens:        number
  lastModified:       string | null
  contextWindowLimit: number
  folderId:           string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB`
  return `${b} B`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function mimeLabel(mime: string): string {
  if (mime === 'application/pdf')                       return 'PDF'
  if (mime === 'application/vnd.google-apps.document')  return 'Google Doc'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet'
  if (mime.startsWith('text/'))                         return 'Text'
  if (mime.includes('word'))                            return 'Word'
  if (mime.includes('excel') || mime.includes('sheet')) return 'Excel'
  return 'File'
}

function mimeColor(mime: string): string {
  if (mime === 'application/pdf')                       return 'red'
  if (mime === 'application/vnd.google-apps.document')  return 'blue'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'green'
  if (mime.startsWith('text/'))                         return 'default'
  return 'default'
}

function contextStatus(pct: number): 'success' | 'normal' | 'exception' {
  if (pct < 60)  return 'success'
  if (pct < 80)  return 'normal'
  return 'exception'
}

function contextColor(pct: number): string {
  if (pct < 60) return '#10b981'
  if (pct < 80) return '#f59e0b'
  return '#ef4444'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analytics/knowledge-base', { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to fetch')
      }
      setStats(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const contextPct  = stats ? Math.round((stats.totalTokens / stats.contextWindowLimit) * 100) : 0
  const availTokens = stats ? Math.max(0, stats.contextWindowLimit - stats.totalTokens) : 0

  // Warn if folder has > 20 files (reliability risk with scoring heuristic)
  const tooManyFiles = (stats?.totalFiles ?? 0) > 20

  const columns: ColumnsType<KnowledgeFile> = [
    {
      title:     'File Name',
      dataIndex: 'name',
      key:       'name',
      ellipsis:  true,
      render: (name: string) => (
        <Flex align="center" gap={8}>
          <FileTextOutlined style={{ color: '#9ca3af', flexShrink: 0 }} />
          <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
        </Flex>
      ),
    },
    {
      title:     'Type',
      dataIndex: 'mimeType',
      key:       'type',
      width:     110,
      render: (mime: string) => (
        <Tag color={mimeColor(mime)} style={{ fontSize: 11, fontWeight: 600 }}>
          {mimeLabel(mime)}
        </Tag>
      ),
    },
    {
      title:     'Size',
      dataIndex: 'sizeBytes',
      key:       'size',
      width:     90,
      sorter:    (a, b) => a.sizeBytes - b.sizeBytes,
      render: (b: number) => (
        <Typography.Text style={{ fontSize: 12, color: b > 10_485_760 ? '#ef4444' : '#555' }}>
          {fmtBytes(b)}
          {b > 10_485_760 && <WarningOutlined style={{ marginLeft: 4, color: '#ef4444' }} />}
        </Typography.Text>
      ),
    },
    {
      title:     'Est. Tokens',
      dataIndex: 'estimatedTokens',
      key:       'tokens',
      width:     110,
      sorter:    (a, b) => a.estimatedTokens - b.estimatedTokens,
      render: (t: number, record) => (
        <Tooltip title={`${((t / (stats?.contextWindowLimit ?? 1_048_576)) * 100).toFixed(1)}% of context window`}>
          <Typography.Text style={{ fontSize: 12, color: '#555' }}>
            ~{fmtTokens(t)}
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title:     'Last Modified',
      dataIndex: 'modifiedTime',
      key:       'modified',
      width:     130,
      sorter:    (a, b) => a.modifiedTime.localeCompare(b.modifiedTime),
      render: (t: string) => (
        <Typography.Text style={{ fontSize: 12, color: '#9ca3af' }}>
          {new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Typography.Text>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, letterSpacing: '-0.02em' }}>
            Knowledge Base
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Google Drive folder · AI agent context health
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined spin={loading} />} onClick={load} loading={loading}>
          Refresh
        </Button>
      </Flex>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 20 }} showIcon />
      )}

      {/* ── Context capacity gauge ── */}
      <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '20px 24px' } }}>
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 12 }}>
          <div>
            <Typography.Text style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 4 }}>
              Context Window Capacity
            </Typography.Text>
            <Typography.Text style={{ fontSize: 13, color: '#555' }}>
              Estimated token usage of all knowledge files vs Gemini 2.5 Flash&apos;s 1M token input limit
            </Typography.Text>
          </div>
          <Typography.Text style={{ fontSize: 22, fontWeight: 700, color: contextColor(contextPct), letterSpacing: '-0.02em', flexShrink: 0, marginLeft: 24 }}>
            {loading ? '—' : `${contextPct}%`}
          </Typography.Text>
        </Flex>
        <Progress
          percent={loading ? 0 : Math.min(contextPct, 100)}
          status={contextStatus(contextPct)}
          strokeColor={contextColor(contextPct)}
          trailColor="#f3f4f6"
          strokeWidth={10}
          showInfo={false}
        />
        <Flex justify="space-between" style={{ marginTop: 8 }}>
          <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
            ~{loading ? '—' : fmtTokens(stats?.totalTokens ?? 0)} used
          </Typography.Text>
          <Typography.Text style={{ fontSize: 11, color: '#9ca3af' }}>
            ~{loading ? '—' : fmtTokens(availTokens)} available · 1M limit
          </Typography.Text>
        </Flex>

        {!loading && contextPct >= 80 && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 14, borderRadius: 8 }}
            message="Context at risk"
            description="Estimated token usage exceeds 80% of the 1M limit. Gemini may not be able to read all files in a single query, which can cause inaccurate insurance pricing recommendations. Remove or split large files."
          />
        )}
        {!loading && contextPct >= 60 && contextPct < 80 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 14, borderRadius: 8 }}
            message="Context headroom shrinking"
            description="Usage is above 60%. Consider archiving older or less relevant pricing files to maintain accurate multi-file retrieval."
          />
        )}
        {!loading && contextPct < 60 && stats && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 14, borderRadius: 8 }}
            message="Context healthy"
            description={`All ${stats.totalFiles} files can be read accurately in a single Gemini query. Plenty of headroom remaining.`}
          />
        )}
      </Card>

      {/* ── Stat cards ── */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          {
            label: 'Total Files',
            value: loading ? '—' : String(stats?.totalFiles ?? 0),
            sub:   tooManyFiles ? '⚠ Over 20 files — scoring accuracy may drop' : 'In knowledge folder',
            warn:  tooManyFiles,
          },
          {
            label: 'Total Size',
            value: loading ? '—' : fmtBytes(stats?.totalSizeBytes ?? 0),
            sub:   'All files combined',
            warn:  false,
          },
          {
            label: 'Est. Total Tokens',
            value: loading ? '—' : `~${fmtTokens(stats?.totalTokens ?? 0)}`,
            sub:   'Approx. context required to read all files',
            warn:  false,
          },
          {
            label: 'Context Available',
            value: loading ? '—' : `~${fmtTokens(availTokens)}`,
            sub:   `${100 - contextPct}% of 1M token limit remaining`,
            warn:  contextPct >= 80,
          },
        ].map(card => (
          <Col key={card.label} xs={24} sm={12} lg={6} style={{ display: 'flex', flexDirection: 'column' }}>
            <Card
              size="small"
              style={{ borderRadius: 12, marginBottom: 12, flex: 1, borderColor: card.warn ? '#fde68a' : undefined }}
              styles={{ body: { padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' } }}
            >
              <Typography.Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
                {card.label}
              </Typography.Text>
              <Statistic
                value={card.value}
                styles={{ value: { fontSize: 22, fontWeight: 700, color: card.warn ? '#d97706' : '#111', letterSpacing: '-0.02em', lineHeight: 1 } }}
              />
              <Typography.Text style={{ fontSize: 11, color: card.warn ? '#d97706' : '#aaa', display: 'block', marginTop: 6 }}>
                {card.sub}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── File list ── */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <Typography.Text style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>
            Files in Knowledge Folder
          </Typography.Text>
        </div>
        <Table
          columns={columns}
          dataSource={stats?.files ?? []}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}
          locale={{ emptyText: 'No files found in knowledge folder' }}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 12, textAlign: 'center' }}>
        Token estimates are approximate. PDFs: ~2.5% of raw bytes are usable text. Google Docs: ~25%. Actual usage varies by content density.
      </Typography.Text>
    </div>
  )
}
