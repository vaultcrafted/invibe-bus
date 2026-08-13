import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Bus, ChevronRight, Trash2 } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const [transfers, setTransfers] = useState([])
  const [stats, setStats] = useState({})
  const [creating, setCreating] = useState(false)
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('bus_transfer').select('*').order('created_at', { ascending: false })
    setTransfers(data || [])
    const ids = (data || []).map(t => t.id)
    if (ids.length) {
      const [g, a] = await Promise.all([
        supabase.from('bus_gruppi').select('transfer_id, pax').in('transfer_id', ids),
        supabase.from('bus_assegnazioni').select('transfer_id, pax').in('transfer_id', ids),
      ])
      const s = {}
      for (const id of ids) s[id] = { tot: 0, ass: 0 }
      for (const r of g.data || []) s[r.transfer_id].tot += r.pax
      for (const r of a.data || []) s[r.transfer_id].ass += r.pax
      setStats(s)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 640, width: '100%', margin: '0 auto' }}>
      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Bus size={16} className="flag" /> Invibe Bus
        </span>
        <span className="sub">{transfers.length} manifest{transfers.length === 1 ? 'o' : 'i'}</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {creating ? (
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="input-label" htmlFor="nn">Nome del transfer</label>
            <input id="nn" className="input-field" placeholder="es. C4 arrivo · sab 20 giu" value={nome}
              onChange={e => setNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={create}>Crea transfer</button>
              <button className="btn btn-ghost" onClick={() => { setCreating(false); setNome('') }}>Annulla</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-signal" onClick={() => setCreating(true)} style={{ padding: '16px 18px', fontSize: 15.5 }}>
            <Plus size={19} /> Nuovo transfer
          </button>
        )}

        {loading && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24, fontFamily: 'var(--mono)', fontSize: 13 }}>caricamento…</div>}

        {!loading && transfers.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '52px 24px' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🚌</div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Il tabellone è vuoto</div>
            <div style={{ fontSize: 14 }}>Crea un transfer e carica l'Excel dei gruppi per iniziare.</div>
          </div>
        )}

        {transfers.map(t => {
          const s = stats[t.id] || { tot: 0, ass: 0 }
          const done = s.tot > 0 && s.ass >= s.tot
          const pct = s.tot ? Math.min(100, (s.ass / s.tot) * 100) : 0
          return (
            <div key={t.id} className="stub">
              <button onClick={() => navigate('/t/' + t.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                <div className="stub-tag" style={{ background: done ? 'var(--go)' : 'var(--ink)' }}>
                  <span className="lbl" style={{ color: done ? '#fff' : 'var(--signal)' }}>{done ? 'FULL' : 'BUS'}</span>
                  <span className="num tab-num">{s.tot ? Math.round(pct) + '%' : '—'}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 18px' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nome}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                    {s.tot === 0 ? 'da importare' : `${s.ass}/${s.tot} pax`}
                    {t.condiviso ? ' · link attivo' : ''}
                  </div>
                  {s.tot > 0 && (
                    <div className={'gauge' + (done ? ' full' : '')} style={{ marginTop: 8 }}>
                      <div style={{ width: pct + '%' }} />
                    </div>
                  )}
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
