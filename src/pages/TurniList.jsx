import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ChevronRight } from 'lucide-react'
import { LiveDot } from '../components/Widgets'
import { useLang } from '../lib/i18n.jsx'

export default function TurniList() {
  const navigate = useNavigate()
  const { t, lang, toggleLang } = useLang()
  const [turni, setTurni] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('bus_turni').select('*').order('codice')
    setTurni(data || [])
    const ids = (data || []).map(x => x.id)
    if (ids.length) {
      const [tr, ro] = await Promise.all([
        supabase.from('bus_transfer').select('id, turno_id').in('turno_id', ids),
        supabase.from('bus_roster').select('id, turno_id').in('turno_id', ids),
      ])
      const s = {}
      for (const id of ids) s[id] = { transfer: 0, roster: 0 }
      for (const r of tr.data || []) s[r.turno_id].transfer++
      for (const r of ro.data || []) s[r.turno_id].roster++
      setStats(s)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('turni-list')
    for (const table of ['bus_turni', 'bus_transfer', 'bus_roster']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function open(turno) {
    await supabase.from('bus_turni').update({ attivo: false }).neq('id', turno.id)
    await supabase.from('bus_turni').update({ attivo: true }).eq('id', turno.id)
    navigate('/turno/' + turno.codice)
  }

  return (
    <div className="shell" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <img src="/logo-header.png" alt="" width="26" height="26" style={{ display: 'block', flexShrink: 0 }} /> {t.appName}
        </span>
        <span className="sub">
          <LiveDot />
          <button className="lang-toggle no-print" onClick={toggleLang} aria-label="Cambia lingua / Change language">
            {lang === 'it' ? 'EN' : 'IT'}
          </button>
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="enter">
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t.turniTitle}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 3 }}>{t.turniSubtitle}</div>
        </div>

        {loading && (
          <div className="cards-grid">
            {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ animationDelay: (i * 90) + 'ms' }} />)}
          </div>
        )}

        <div className="cards-grid">
          {turni.map((tn, i) => {
            const s = stats[tn.id] || { transfer: 0, roster: 0 }
            return (
              <div key={tn.id} className="stub enter" style={{ '--d': (i * 45) + 'ms' }}>
                <button onClick={() => open(tn)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                  <div className={'stub-tag' + (tn.attivo ? ' stub-tag--full' : ' stub-tag--neutral')}>
                    <span className="lbl">{tn.attivo ? t.turnoActive : tn.codice}</span>
                    <span className="num tab-num">{tn.codice}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 18px' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{tn.nome}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                      {t.turnoTransferCount(s.transfer)} · {t.turnoRosterCount(s.roster)}
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-tertiary)" style={{ marginRight: 14, flexShrink: 0 }} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
