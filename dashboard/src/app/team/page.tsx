'use client'

import { useEffect, useState } from 'react'

interface TeamMember {
  id: string
  name: string
  role: string
  email: string | null
  color: string
  initials: string
  contacts_assigned: number
  contacts_contacted: number
  meetings: number
  last_active: string | null
}

interface ActivityEntry {
  id: string
  date: string
  type: 'whatsapp' | 'email' | 'call' | 'meeting'
  contact_name: string
  company: string | null
  note: string
}

const TYPE_ICON: Record<string, string>  = { whatsapp: '💬', email: '✉️', call: '📞', meeting: '🤝' }
const TYPE_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', call: 'Call', meeting: 'Meeting' }

function Avatar({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', border: `2px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 700, color, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

export default function TeamPage() {
  const [members,  setMembers]  = useState<TeamMember[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [active,   setActive]   = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/team', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { members: [], activity: [] })
      .then((data: { members: TeamMember[]; activity: ActivityEntry[] }) => {
        setMembers(data.members ?? [])
        setActivity(data.activity ?? [])
        if (data.members?.length) setActive(data.members[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const member   = members.find(m => m.id === active) ?? null
  const feed     = activity.filter(a => a.id === active)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>Team</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#aaa' }}>Employee outreach activity and contact assignments</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#bbb', fontSize: 13 }}>
          Loading team…
        </div>
      ) : members.length === 0 ? (
        <div style={{
          border: '1px dashed #e5e5e5', borderRadius: 12, padding: '48px 32px',
          textAlign: 'center', background: '#fafafa',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#aaa' }}>No team members yet</p>
          <p style={{ margin: 0, fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>
            Set up your team in Supabase to track employee outreach activity here.<br />
            Each member needs: name, role, email, and an activity log.
          </p>
        </div>
      ) : (
        <>
          {/* Employee selector cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
            {members.map(m => {
              const isActive = m.id === active
              return (
                <button
                  key={m.id}
                  onClick={() => setActive(m.id)}
                  style={{
                    border: isActive ? `2px solid ${m.color}` : '2px solid #f0f0f0',
                    borderRadius: 10, padding: '14px 16px',
                    background: isActive ? m.color + '08' : '#fff',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Avatar initials={m.initials} color={m.color} size={34} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.role}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isActive ? m.color : '#111', letterSpacing: '-0.02em' }}>{m.contacts_contacted}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#bbb' }}>contacted</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isActive ? m.color : '#111', letterSpacing: '-0.02em' }}>{m.meetings}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#bbb' }}>meetings</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isActive ? m.color : '#111', letterSpacing: '-0.02em' }}>{m.contacts_assigned}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#bbb' }}>assigned</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          {member && (
            <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>

              {/* Panel header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 14, background: member.color + '06' }}>
                <Avatar initials={member.initials} color={member.color} size={44} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>{member.name}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>
                    {member.role}{member.last_active ? ` · Last active ${member.last_active}` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: member.color + '18', color: member.color }}>Active</span>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
                {[
                  { label: 'Assigned',  value: member.contacts_assigned },
                  { label: 'Contacted', value: member.contacts_contacted, sub: member.contacts_assigned ? `${Math.round(member.contacts_contacted / member.contacts_assigned * 100)}% reach rate` : undefined },
                  { label: 'Meetings',  value: member.meetings },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{s.label}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.03em' }}>{s.value}</p>
                    {s.sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#bbb' }}>{s.sub}</p>}
                  </div>
                ))}
              </div>

              {/* Activity feed */}
              <div style={{ padding: '16px 20px' }}>
                <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Recent Outreach Activity
                </p>
                {feed.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>No activity logged yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {feed.map((entry, i) => (
                      <div key={entry.id + i} style={{ display: 'flex', gap: 14, paddingBottom: i < feed.length - 1 ? 18 : 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f4f4f5', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                            {TYPE_ICON[entry.type] ?? '📋'}
                          </div>
                          {i < feed.length - 1 && <div style={{ width: 1, flex: 1, background: '#f0f0f0', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, paddingTop: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{entry.contact_name}</span>
                            {entry.company && <><span style={{ fontSize: 11, color: '#aaa' }}>·</span><span style={{ fontSize: 11, color: '#888' }}>{entry.company}</span></>}
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: member.color + '14', color: member.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {TYPE_LABEL[entry.type] ?? entry.type}
                            </span>
                            <span style={{ fontSize: 11, color: '#ccc', marginLeft: 'auto' }}>{entry.date}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.5 }}>{entry.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
