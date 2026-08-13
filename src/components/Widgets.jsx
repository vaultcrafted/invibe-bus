import { useEffect, useState } from 'react'
import { useCountUp } from '../lib/useCountUp'

// Numero animato: scorre verso il nuovo valore invece di scattare.
export function CountNum({ value, className = '' }) {
  const display = useCountUp(value)
  return <span className={className}>{display}</span>
}

// Barra capienza che si riempie all'apertura invece di comparire già piena.
export function Gauge({ pct, tone = '', style }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, pct))))
    return () => cancelAnimationFrame(id)
  }, [pct])
  return (
    <div className={'gauge' + (tone ? ' ' + tone : '')} style={style}>
      <div style={{ width: w + '%' }} />
    </div>
  )
}

// Pallino "live" pulsante: segnala che i dati sono in sync realtime.
export function LiveDot() {
  return <span className="live-dot" aria-hidden="true" />
}

// Cartellino statistica: numero animato + etichetta, per le home page ricche di dati.
const TONES = {
  blue: { bg: 'var(--iv-blue-light)', fg: 'var(--iv-blue-dark)' },
  go: { bg: 'var(--go-bg)', fg: 'var(--go)' },
  signal: { bg: 'rgba(255,179,0,.16)', fg: 'var(--signal-dim)' },
  warn: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
}
export function StatCard({ icon: Icon, label, value, tone = 'blue', style }) {
  const c = TONES[tone] || TONES.blue
  return (
    <div className="card enter" style={{ padding: 14, ...style }}>
      <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon size={16} />
      </div>
      <div className="tab-num" style={{ fontSize: 25, fontWeight: 800, lineHeight: 1 }}><CountNum value={value} /></div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 5 }}>{label}</div>
    </div>
  )
}
