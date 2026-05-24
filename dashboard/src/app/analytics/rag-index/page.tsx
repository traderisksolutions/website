'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, Button, Table, Tag, Typography, Flex, Alert, Statistic, Row, Col } from 'antd'
import { ReloadOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

type IndexedFile = {
  file_id:      string
  file_name:    string
  chunk_count:  number
  last_indexed: string
}

type Status = {
  files:       IndexedFile[]
  totalChunks: number
}

type IndexResult = {
  indexed:     string[]
  skipped:     string[]
  deleted:     string[]
  errors:      string[]
  totalChunks: number
}

export default function RagIndexPage() {
  const [status,   setStatus]   = useState<Status | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [lastRun,  setLastRun]  = useState<IndexResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/knowledge/index', { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setStatus(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load index status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function runReindex(force = false) {
    setIndexing(true)
    setError(null)
    setLastRun(null)
    try {
      const res = await fetch('/api/knowledge/index', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
        body:    JSON.stringify({ force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Index failed')
      setLastRun(data)
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-index failed')
    } finally {
      setIndexing(false)
    }
  }

  const columns: ColumnsType<IndexedFile> = [
    {
      title:     'File',
      dataIndex: 'file_name',
      key:       'file_name',
      render: (name: string) => (
        <Typography.Text style={{ fontSize: 13 }}>{name}</Typography.Text>
      ),
    },
    {
      title:     'Chunks',
      dataIndex: 'chunk_count',
      key:       'chunk_count',
      width:     90,
      render: (n: number) => (
        <Tag color="blue" style={{ fontWeight: 600, fontSize: 11 }}>{n}</Tag>
      ),
    },
    {
      title:     'Last Indexed',
      dataIndex: 'last_indexed',
      key:       'last_indexed',
      width:     160,
      render: (t: string) => (
        <Typography.Text style={{ fontSize: 12, color: '#9ca3af' }}>
          {new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Typography.Text>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0, letterSpacing: '-0.02em' }}>
            RAG Knowledge Index
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Google Drive PDFs → vector chunks → Gemini retrieval
          </Typography.Text>
        </div>
        <Flex gap={8}>
          <Button icon={<ReloadOutlined />} onClick={loadStatus} loading={loading}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => runReindex(false)}
            loading={indexing}
          >
            Re-index New Files
          </Button>
          <Button
            danger
            onClick={() => runReindex(true)}
            loading={indexing}
            title="Forces all files to be re-indexed, even if unchanged"
          >
            Force Re-index All
          </Button>
        </Flex>
      </Flex>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16, borderRadius: 8 }} />}

      {/* Last run result */}
      {lastRun && (
        <Alert
          type={lastRun.errors.length > 0 ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
          message={`Re-index complete — ${lastRun.indexed.length} indexed, ${lastRun.skipped.length} skipped, ${lastRun.deleted.length} deleted`}
          description={
            lastRun.errors.length > 0
              ? `Errors: ${lastRun.errors.join(' · ')}`
              : lastRun.indexed.length > 0
                ? `Indexed: ${lastRun.indexed.join(', ')}`
                : 'No changes detected — all files already up to date.'
          }
        />
      )}

      {/* Stat cards */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card size="small" style={{ borderRadius: 12, marginBottom: 12, flex: 1 }} styles={{ body: { padding: '16px 20px' } }}>
            <Typography.Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
              Indexed Files
            </Typography.Text>
            <Statistic
              value={loading ? '—' : status?.files.length ?? 0}
              styles={{ value: { fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' } }}
            />
            <Typography.Text style={{ fontSize: 11, color: (status?.files.length ?? 0) > 15 ? '#ef4444' : '#aaa', display: 'block', marginTop: 4 }}>
              {(status?.files.length ?? 0) > 15 ? '⚠ Over recommended 15-file limit' : 'Target: ≤ 15 files'}
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card size="small" style={{ borderRadius: 12, marginBottom: 12, flex: 1 }} styles={{ body: { padding: '16px 20px' } }}>
            <Typography.Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
              Total Chunks
            </Typography.Text>
            <Statistic
              value={loading ? '—' : status?.totalChunks ?? 0}
              styles={{ value: { fontSize: 26, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' } }}
            />
            <Typography.Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 4 }}>
              Searchable text passages
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card size="small" style={{ borderRadius: 12, marginBottom: 12, flex: 1 }} styles={{ body: { padding: '16px 20px' } }}>
            <Typography.Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa', display: 'block', marginBottom: 8 }}>
              Auto-sync
            </Typography.Text>
            <Typography.Text style={{ fontSize: 20, fontWeight: 700, color: '#10b981', display: 'block', letterSpacing: '-0.02em' }}>
              Nightly 2am
            </Typography.Text>
            <Typography.Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 4 }}>
              New files only · use Re-index for immediate
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {/* File table */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <Flex justify="space-between" align="center">
            <Typography.Text style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aaa' }}>
              Indexed Files
            </Typography.Text>
            {(status?.files.length ?? 0) > 15 && (
              <Tag icon={<WarningOutlined />} color="warning">
                {status!.files.length} / 15 recommended limit
              </Tag>
            )}
          </Flex>
        </div>
        <Table
          columns={columns}
          dataSource={status?.files ?? []}
          rowKey="file_id"
          loading={loading}
          size="small"
          pagination={false}
          style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden' }}
          locale={{ emptyText: 'No files indexed yet — click "Re-index New Files" to start' }}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 12, textAlign: 'center' }}>
        Each chunk is ~1,500 characters of extracted PDF text with a 150-character overlap. The AI retrieves the 6 most relevant chunks per email query.
      </Typography.Text>
    </div>
  )
}
