export default function WhatsAppPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

      {/* Top bar */}
      <div style={{
        height: 52, padding: '0 24px',
        display: 'flex', alignItems: 'center',
        background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0,
      }}>
        <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>WhatsApp</h1>
      </div>

      {/* Placeholder */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#111' }}>
            Coming soon
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
            Integrate with Andrian
          </p>
        </div>
      </main>
    </div>
  )
}
