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
