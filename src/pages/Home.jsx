import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Bus, ChevronRight, Trash2, Users, Share2 } from 'lucide-react'
import { Gauge, CountNum, LiveDot, StatCard } from '../components/Widgets'

function saluto() {
  const h = new Date().getHours()
  if (h < 6) return 'Ancora in giro'
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

function fmtData(iso) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'oggi'
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'ieri'
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function statusOf(s) {
  if (s.tot === 0) return { label: 'da importare', tone: 'pill-neutral' }
  if (s.ass >= s.tot) return { label: 'completato', tone: 'pill-go' }
  if (s.ass > 0) return { label: 'in corso', tone: 'pill-blue' }
  return { label: 'da assegnare', tone: 'pill-warn' }
}

export default function Home() {
  const navigate = useNavigate()
  const [transfers, setTransfers] = useState([])
  const [stats, setStats] = useState({})
  const [totMezzi, setTotMezzi] = useState(0)
  const [creating, setCreating] = useState(false)
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('bus_transfer').select('*').order('created_at', { ascending: false })
    setTransfers(data || [])
    const ids = (data || []).map(t => t.id)
    if (ids.length) {
      const [g, a, m] = await Promise.all([
        supabase.from('bus_gruppi').select('transfer_id, pax').in('transfer_id', ids),
        supabase.from('bus_assegnazioni').select('transfer_id, pax').in('transfer_id', ids),
        supabase.from('bus_mezzi').select('transfer_id').in('transfer_id', ids),
      ])
      const s = {}
      for (const id of ids) s[id] = { tot: 0, ass: 0 }
      for (const r of g.data || []) s[r.transfer_id].tot += r.pax
      for (const r of a.data || []) s[r.transfer_id].ass += r.pax
      setStats(s)
      setTotMezzi((m.data || []).length)
    } else {
      setStats({})
      setTotMezzi(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('home-bus')
    for (const table of ['bus_transfer', 'bus_gruppi', 'bus_assegnazioni', 'bus_mezzi']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function create() {
    const n = nome.trim()
    if (!n) return
    const { data, error } = await supabase.from('bus_transfer').insert({ nome: n }).select().single()
    if (!error && data) navigate('/t/' + data.id)
  }

  async function remove(t) {
    if (!confirm(`Eliminare "${t.nome}" con tutti i suoi gruppi e bus? Non si può annullare.`)) return
    await supabase.from('bus_transfer').delete().eq('id', t.id)
    load()
  }

  const totPaxGestiti = Object.values(stats).reduce((s, v) => s + v.tot, 0)
  const linkAttivi = transfers.filter(t => t.condiviso).length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 640, width: '100%', margin: '0 auto' }}>
      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Bus size={16} className="flag" /> Invibe Bus
        </span>
        <span className="sub"><LiveDot /> {transfers.length} manifest{transfers.length === 1 ? 'o' : 'i'}</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div className="enter">
          <div style={{ fontSize: 21, fontWeight: 800 }}>{saluto()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)', marginTop: 2 }}>
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {transfers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatCard icon={Bus} label="Transfer" value={transfers.length} tone="blue" style={{ '--d': '20ms' }} />
            <StatCard icon={Users} label="Pax gestiti" value={totPaxGestiti} tone="go" style={{ '--d': '50ms' }} />
            <StatCard icon={Bus} label="Bus in flotta" value={totMezzi} tone="signal" style={{ '--d': '80ms' }} />
            <StatCard icon={Share2} label="Link attivi" value={linkAttivi} tone="warn" style={{ '--d': '110ms' }} />
          </div>
        )}

        {creating ? (
          <div className="card enter" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="input-label" htmlFor="nn">Nome del transfer</label>
            <input id="nn" className="input-field" placeholder="es. C4 arrivo · sab 20 giu" value={nome}
              onChange={e => setNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={create}>Crea transfer</button>
              <button className="btn btn-ghost" onClick={() => { setCreating(false); setNome('') }}>Annulla</button>
            </div>
          </div>
        ) : (
          <button className="hero-banner enter" onClick={() => setCreating(true)} style={{ '--d': '140ms' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.14em', color: 'var(--signal)', fontWeight: 800, marginBottom: 6 }}>
                + NUOVO TRANSFER
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Crea e assegna in pochi tocchi</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>Importa l'Excel, aggiungi i bus, sei pronto.</div>
            </div>
            <div className="hb-icon"><Bus size={26} /></div>
          </button>
        )}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ animationDelay: (i * 90) + 'ms' }} />)}
          </div>
        )}

        {!loading && transfers.length === 0 && (
          <div className="enter" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 24px 24px' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🚌</div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Il tabellone è vuoto</div>
            <div style={{ fontSize: 14 }}>Crea un transfer e carica l'Excel dei gruppi per iniziare.</div>
          </div>
        )}

        {transfers.length > 0 && (
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>Transfer</div>
        )}

        {transfers.map((t, i) => {
          const s = stats[t.id] || { tot: 0, ass: 0 }
          const done = s.tot > 0 && s.ass >= s.tot
          const pct = s.tot ? Math.min(100, (s.ass / s.tot) * 100) : 0
          const st = statusOf(s)
          return (
            <div key={t.id} className="stub enter" style={{ '--d': (150 + i * 45) + 'ms' }}>
              <button onClick={() => navigate('/t/' + t.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                <div className={'stub-tag' + (done ? ' stub-tag--full' : '')}>
                  <span className="lbl">{done ? 'FULL' : 'BUS'}</span>
                  <span className="num tab-num">{s.tot ? Math.round(pct) : 0}{s.tot ? '%' : '—'}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nome}</span>
                    <span className={'pill ' + st.tone} style={{ flexShrink: 0 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                    {fmtData(t.created_at)} · {s.tot === 0 ? 'nessun gruppo' : <><CountNum value={s.ass} />/{s.tot} pax</>}
                  </div>
                  {s.tot > 0 && <Gauge pct={pct} tone={done ? 'full' : ''} style={{ marginTop: 8 }} />}
                </div>
                <ChevronRight size={18} color="var(--text-tertiary)" style={{ marginRight: 14, flexShrink: 0 }} />
              </button>
              <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => remove(t)} aria-label={'Elimina ' + t.nome}
                  style={{ color: 'var(--stop)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: 7 }}>
                  <Trash2 size={14} /> Elimina
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
