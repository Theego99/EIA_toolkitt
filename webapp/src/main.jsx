import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { registerSW, setupInstallPrompt } from './lib/pwa.js'

// Register service worker (enables offline + PWA install)
registerSW()
setupInstallPrompt()

// ── Global error boundary ─────────────────────────────────────────────────
// Enterprise fail-safe: if any component throws, show a recovery screen
// instead of a white page. Local data (IndexedDB) is untouched, so nothing
// entered in the field is lost — the user just reloads.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[App error]', error, info)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#F4F1EA', fontFamily: "'Noto Sans JP',sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 460, background: '#fff', borderRadius: 16, padding: '36px 32px',
          border: '1px solid #DDD8CE', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛟</div>
          <h1 style={{ fontSize: 20, color: '#1B4332', margin: '0 0 10px' }}>一時的な問題が発生しました</h1>
          <p style={{ color: '#4A5550', fontSize: 14, lineHeight: 1.8, margin: '0 0 8px' }}>
            画面の表示中にエラーが発生しました。<br/>
            <b>現場で入力したデータは端末内に安全に保存されています</b>（失われていません）。
            再読み込みすると復帰します。
          </p>
          <p style={{ color: '#8A948E', fontSize: 12, margin: '0 0 20px', wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error || '')}
          </p>
          <button onClick={() => window.location.reload()} style={{ background: '#1B4332', color: '#fff',
            border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            再読み込みして復帰する
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
