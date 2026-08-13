import { useEffect, useRef, useState } from 'react'

// Anima un numero verso il nuovo valore invece di farlo scattare di colpo.
// Usato ovunque un contatore cambia via realtime (pax assegnati, posti liberi...).
export function useCountUp(value, duration = 480) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  const raf = useRef(null)

  useEffect(() => {
    const from = prev.current
    const to = value
    if (from === to) return
    const start = performance.now()
    cancelAnimationFrame(raf.current)
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else prev.current = to
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return display
}
