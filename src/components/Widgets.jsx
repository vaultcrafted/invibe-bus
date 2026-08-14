import { useEffect, useState } from 'react'
import { useCountUp } from '../lib/useCountUp'

// Palette identità bus: un colore diverso per ognuno, a rotazione.
// Verde (pieno) e rosso (oltre capienza) restano segnali di stato e hanno sempre la priorità.
export const BUS_COLORS = [
  ['#4C8DF9', '#1450C8'], // blu
  ['#A78BFA', '#6D28D9'], // viola
  ['#2DD4BF', '#0F766E'], // verde acqua
  ['#FB923C', '#C2410C'], // arancio
  ['#F472B6', '#BE185D'], // rosa
  ['#818CF8', '#4338CA'], // indaco
]
export function busColorStyle(i) {
  const [from, to] = BUS_COLORS[i % BUS_COLORS.length]
  return { backgroundImage: `linear-gradient(165deg, ${from} 0%, ${to} 100%)` }
}

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

// Guida rapida: pannello con passi numerati, richiudibile.
export function HelpModal({ title, steps, closeLabel, onClose }) {
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(11,13,16,.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div className="card enter" style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflow: 'auto', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
        onClick={e => e.stopPropagation()}>
        <div className="board-strip" style={{ position: 'sticky', top: 0 }}>
          <span>{title}</span>
          <button onClick={onClose} aria-label={closeLabel} style={{ display: 'flex' }}><span style={{ fontSize: 18 }}>×</span></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map(([head, body], i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: 'var(--r-full)', background: 'var(--iv-blue-light)',
                color: 'var(--iv-blue-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13, fontFamily: 'var(--mono)',
              }}>{i + 1}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 2 }}>{head}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</div>
              </div>
            </div>
          ))}
          <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 6 }}>{closeLabel}</button>
        </div>
      </div>
    </div>
  )
}

// Composizione uomini/donne di un bus: barra a due colori + numeri.
export function GenderBar({ uomini, donne, sconosciuti = 0, menLabel, womenLabel }) {
  const tot = uomini + donne + sconosciuti
  if (!tot) return null
  const pctU = (uomini / tot) * 100
  const pctD = (donne / tot) * 100
  return (
    <div>
      <div style={{ height: 7, borderRadius: 'var(--r-full)', overflow: 'hidden', display: 'flex', background: 'var(--bg-mute)' }}>
        {uomini > 0 && <div style={{ width: pctU + '%', background: 'var(--iv-blue)' }} />}
        {donne > 0 && <div style={{ width: pctD + '%', background: '#F472B6' }} />}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--mono)' }}>
        <span>{menLabel} {uomini}</span>
        <span>{womenLabel} {donne}</span>
        {sconosciuti > 0 && <span>? {sconosciuti}</span>}
      </div>
    </div>
  )
}

// Ciambella capienza flotta: reale, non decorativa. Si riempie all'apertura.
export function FleetDonut({ pct, size = 108 }) {
  const [dash, setDash] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDash(Math.max(0, Math.min(100, pct))))
    return () => cancelAnimationFrame(id)
  }, [pct])
  const r = 42, c = 2 * Math.PI * r
  const offset = c - (dash / 100) * c
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--bg-mute)" strokeWidth="11" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--iv-blue)" strokeWidth="11"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)' }} />
    </svg>
  )
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
