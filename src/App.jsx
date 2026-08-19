import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Home from './pages/Home'
import Transfer from './pages/Transfer'
import Share from './pages/Share'
import Roster from './pages/Roster'
import TurniList from './pages/TurniList'
import { ModeProvider } from './lib/mode.jsx'
import { TurnoProvider } from './lib/turno.jsx'
import { supabase } from './lib/supabase'
import { useLang } from './lib/i18n.jsx'

function Centered({ children }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--mono)', fontSize: 13 }}>{children}</div>
}

// Carica il turno dal codice nell'URL (/turno/C6) prima di mostrare la pagina.
function TurnoRoute({ children }) {
  const { codice } = useParams()
  const { t } = useLang()
  const [turno, setTurno] = useState(undefined)

  useEffect(() => {
    setTurno(undefined)
    supabase.from('bus_turni').select('*').eq('codice', codice).maybeSingle().then(({ data }) => setTurno(data ?? null))
  }, [codice])

  if (turno === undefined) return <Centered>{t.loading}</Centered>
  if (turno === null) return <Navigate to="/" replace />
  return <TurnoProvider turno={turno}>{children}</TurnoProvider>
}

// Modalità agenzia: risolve da solo il turno attivo, senza farlo scegliere.
function AgencyRoute({ children }) {
  const { t } = useLang()
  const [turno, setTurno] = useState(undefined)

  useEffect(() => {
    supabase.from('bus_turni').select('*').eq('attivo', true).maybeSingle().then(({ data }) => setTurno(data ?? null))
    const ch = supabase.channel('agency-active-turno')
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bus_turni' }, () => {
      supabase.from('bus_turni').select('*').eq('attivo', true).maybeSingle().then(({ data }) => setTurno(data ?? null))
    })
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  if (turno === undefined) return <Centered>{t.loading}</Centered>
  if (turno === null) return <Centered>{t.noActiveTurno}</Centered>
  return <ModeProvider agency={true}><TurnoProvider turno={turno}>{children}</TurnoProvider></ModeProvider>
}

export default function App() {
  return (
    <Routes>
      <Route path="/share/:id" element={<Share />} />
      <Route path="/" element={<TurniList />} />
      <Route path="/turno/:codice" element={<TurnoRoute><ModeProvider agency={false}><Home /></ModeProvider></TurnoRoute>} />
      <Route path="/turno/:codice/roster" element={<TurnoRoute><Roster /></TurnoRoute>} />
      <Route path="/t/:id" element={<ModeProvider agency={false}><Transfer /></ModeProvider>} />
      <Route path="/agenzia" element={<AgencyRoute><Home /></AgencyRoute>} />
      <Route path="/agenzia/t/:id" element={<ModeProvider agency={true}><Transfer /></ModeProvider>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
