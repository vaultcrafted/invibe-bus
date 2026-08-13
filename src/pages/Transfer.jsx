import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, Upload, Plus, Bus, Trash2, Share2, Download,
  ChevronDown, ChevronUp, Check, X, Users
} from 'lucide-react'

const TAGLI = [50, 53, 54, 63]

export default function Transfer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [transfer, setTransfer] = useState(null)
  const [gruppi, setGruppi] = useState([])
  const [mezzi, setMezzi] = useState([])
  const [assegnazioni, setAssegnazioni] = useState([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState(new Set())
  const [sortBy, setSortBy] = useState('codice')
  const [filterPickup, setFilterPickup] = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [showDone, setShowDone] = useState(false)

  const [preview, setPreview] = useState(null)
  const [addingBus, setAddingBus] = useState(false)
  const [customCap, setCustomCap] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  function notify(msg) { setToast(msg); setTimeout(() => setToast(''), 2600) }

  async function load() {
    const [t, g, m, a] = await Promise.all([
      supabase.from('bus_transfer').select('*').eq('id', id).single(),
      supabase.from('bus_gruppi').select('*').eq('transfer_id', id).order('codice'),
      supabase.from('bus_mezzi').select('*').eq('transfer_id', id).order('ordine'),
      supabase.from('bus_assegnazioni').select('*').eq('transfer_id', id),
    ])
    setTransfer(t.data)
    setGruppi(g.data || [])
    setMezzi(m.data || [])
    setAssegnazioni(a.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('bus-' + id)
    for (const table of ['bus_gruppi', 'bus_mezzi', 'bus_assegnazioni', 'bus_transfer']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: table === 'bus_transfer' ? `id=eq.${id}` : `transfer_id=eq.${id}` }, () => load())
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  const assByGruppo = useMemo(() => {
    const m = {}
    for (const a of assegnazioni) m[a.gruppo_id] = (m[a.gruppo_id] || 0) + a.pax
    return m
  }, [assegnazioni])

  const restanti = g => g.pax - (assByGruppo[g.id] || 0)

  const usedByMezzo = useMemo(() => {
    const m = {}
    for (const a of assegnazioni) m[a.mezzo_id] = (m[a.mezzo_id] || 0) + a.pax
    return m
  }, [assegnazioni])

  const totPax = gruppi.reduce((s, g) => s + g.pax, 0)
  const totAss = Object.values(assByGruppo).reduce((s, v) => s + v, 0)

  const pickups = useMemo(() => {
    const set = new Map()
    for (const g of gruppi) {
      const p = g.pickup_point || '(senza pickup)'
      if (!set.has(p)) set.set(p, [])
      set.get(p).push(g)
    }
    const arr = [...set.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it'))
    for (const [, gs] of arr) {
      gs.sort((a, b) => sortBy === 'pax' ? b.pax - a.pax : a.codice.localeCompare(b.codice, 'it'))
    }
    return arr
  }, [gruppi, sortBy])

  const selPax = [...selected].reduce((s, gid) => {
    const g = gruppi.find(x => x.id === gid)
    return s + (g ? restanti(g) : 0)
  }, 0)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
    const parsed = []
    for (const r of rows) {
      const codice = String(r[0] ?? '').trim()
      const pickup = String(r[1] ?? '').trim()
      const pax = parseInt(r[2], 10)
      if (!codice || !Number.isFinite(pax) || pax <= 0) continue
      if (/^codice|^cod\.|^prenotaz/i.test(codice)) continue
      parsed.push({ codice, pickup_point: pickup, pax })
    }
    if (!parsed.length) { notify('Nel file non ho trovato righe valide (A codice, B pickup, C pax).'); return }
    setPreview(parsed)
  }

  async function confirmImport() {
    setBusy(true)
    const rows = preview.map(r => ({ ...r, transfer_id: id }))
    const { error } = await supabase.from('bus_gruppi')
      .upsert(rows, { onConflict: 'transfer_id,codice' })
    setBusy(false)
    if (error) { notify('Errore import: ' + error.message); return }
    setPreview(null)
    notify(`Importati ${rows.length} gruppi.`)
    load()
  }

  async function addBus(cap) {
    const capienza = parseInt(cap, 10)
    if (!Number.isFinite(capienza) || capienza <= 0) return
    const ordine = mezzi.length
    await supabase.from('bus_mezzi').insert({ transfer_id: id, nome: 'Bus ' + (ordine + 1), capienza, ordine })
    setAddingBus(false); setCustomCap('')
    load()
  }

  async function removeBus(m) {
    const used = usedByMezzo[m.id] || 0
    if (used > 0 && !confirm(`${m.nome} ha ${used} pax assegnati: tornano tra i gruppi da assegnare. Eliminare?`)) return
    await supabase.from('bus_mezzi').delete().eq('id', m.id)
    load()
  }

  async function assignTo(m) {
    if (!selected.size) return
    const liberi = m.capienza - (usedByMezzo[m.id] || 0)
    const sel = gruppi.filter(g => selected.has(g.id) && restanti(g) > 0)
    const tot = sel.reduce((s, g) => s + restanti(g), 0)

    if (tot <= liberi) {
      setBusy(true)
      const rows = sel.map(g => ({ transfer_id: id, gruppo_id: g.id, mezzo_id: m.id, pax: restanti(g) }))
      const { error } = await supabase.from('bus_assegnazioni').insert(rows)
      setBusy(false)
      if (error) { notify('Errore: ' + error.message); return }
      setSelected(new Set())
      notify(`${tot} pax su ${m.nome} · restano ${liberi - tot} posti`)
      load()
      return
    }

    if (sel.length === 1 && liberi > 0) {
      const g = sel[0]
      if (confirm(`${g.codice} ha ${restanti(g)} pax ma su ${m.nome} restano ${liberi} posti.\nDividere il gruppo: ${liberi} qui e ${restanti(g) - liberi} da assegnare a un altro bus?`)) {
        setBusy(true)
        const { error } = await supabase.from('bus_assegnazioni').insert({ transfer_id: id, gruppo_id: g.id, mezzo_id: m.id, pax: liberi })
        setBusy(false)
        if (error) { notify('Errore: ' + error.message); return }
        setSelected(new Set([g.id]))
        notify(`${g.codice} diviso: ${liberi} su ${m.nome}, ${restanti(g) - liberi} ancora da assegnare.`)
        load()
      }
      return
    }
    notify(`Non ci stanno: ${tot} pax selezionati, ${liberi} posti liberi su ${m.nome}. Togli qualche gruppo, o seleziona un solo gruppo per dividerlo.`)
  }

  async function unassign(a) {
    await supabase.from('bus_assegnazioni').delete().eq('id', a.id)
    load()
  }

  async function toggleShare() {
    const v = !transfer.condiviso
    await supabase.from('bus_transfer').update({ condiviso: v, updated_at: new Date().toISOString() }).eq('id', id)
    setTransfer({ ...transfer, condiviso: v })
    if (v) copyLink()
  }

  function copyLink() {
    const url = window.location.origin + '/share/' + id
    navigator.clipboard?.writeText(url).then(() => notify('Link copiato: apribile senza login.'))
      .catch(() => notify(url))
  }

  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    for (const m of mezzi) {
      const rows = assegnazioni.filter(a => a.mezzo_id === m.id).map(a => {
        const g = gruppi.find(x => x.id === a.gruppo_id)
        return { Codice: g?.codice, 'Pickup point': g?.pickup_point, Pax: a.pax }
      }).sort((a, b) => String(a['Pickup point']).localeCompare(String(b['Pickup point']), 'it'))
      rows.push({ Codice: 'TOTALE', 'Pickup point': '', Pax: rows.reduce((s, r) => s + r.Pax, 0) })
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, (m.nome + ' (' + m.capienza + ')').slice(0, 31))
    }
    const rest = gruppi.filter(g => restanti(g) > 0).map(g => ({ Codice: g.codice, 'Pickup point': g.pickup_point, 'Pax da assegnare': restanti(g) }))
    if (rest.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rest), 'Non assegnati')
    XLSX.writeFile(wb, (transfer?.nome || 'transfer').replace(/[^\w\s-]/g, '') + ' - bus.xlsx')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--mono)', fontSize: 13 }}>caricamento…</div>
  if (!transfer) return <div style={{ padding: 40, textAlign: 'center' }}>Transfer non trovato.</div>

  const done = totPax > 0 && totAss >= totPax

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 640, width: '100%', margin: '0 auto', paddingBottom: selected.size ? 140 : 24 }}>

      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate('/')} aria-label="Indietro" style={{ display: 'flex' }}><ArrowLeft size={16} /></button>
        <span style={{ flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transfer.nome}</span>
        <span className="sub">{totAss}/{totPax}</span>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div className={'gauge' + (done ? ' full' : '')} style={{ height: 11 }}>
          <div style={{ width: totPax ? Math.min(100, (totAss / totPax) * 100) + '%' : 0 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: done ? 'var(--go)' : 'var(--text-secondary)', marginTop: 7, fontFamily: 'var(--mono)' }}>
          <span>{done ? '✓ tutti assegnati' : `${totPax - totAss} pax da assegnare`}</span>
          <span>{mezzi.length} bus · {mezzi.reduce((s, m) => s + m.capienza, 0)} posti</span>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, padding: '14px 16px', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Importa</button>
        <button className="btn btn-outline" onClick={toggleShare} style={transfer.condiviso ? { background: 'var(--go-bg)', color: 'var(--go)', borderColor: 'transparent' } : {}}>
          <Share2 size={16} /> {transfer.condiviso ? 'Link attivo' : 'Condividi'}
        </button>
        {transfer.condiviso && <button className="btn btn-outline" onClick={copyLink}>Copia link</button>}
        <button className="btn btn-outline" onClick={exportXlsx} disabled={!mezzi.length}><Download size={16} /> Excel</button>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />

      {preview && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Anteprima import · {preview.length} gruppi · {preview.reduce((s, r) => s + r.pax, 0)} pax</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              I codici già presenti vengono aggiornati (pickup e pax), gli altri aggiunti. Le assegnazioni fatte restano.
            </div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
              {preview.slice(0, 60).map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)' }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.codice}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.pickup_point || '—'}</span>
                  <span>{r.pax} pax</span>
                </div>
              ))}
              {preview.length > 60 && <div style={{ padding: 8, color: 'var(--text-tertiary)' }}>… e altri {preview.length - 60}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmImport} disabled={busy}><Check size={16} /> Importa</button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}><X size={16} /> Annulla</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mezzi.map((m, i) => {
          const used = usedByMezzo[m.id] || 0
          const liberi = m.capienza - used
          const list = assegnazioni.filter(a => a.mezzo_id === m.id)
          const full = liberi === 0
          return (
            <div key={m.id} className="stub">
              <div className="stub-head">
                <div className="stub-tag" style={{ background: full ? 'var(--go)' : 'var(--ink)' }}>
                  <span className="lbl" style={{ color: full ? '#fff' : 'var(--signal)' }}>BUS</span>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="stub-head-body">
                  <span className="name">{m.nome}</span>
                  <span className="meta">{used}/{m.capienza} POSTI · LIBERI {liberi}</span>
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div className={'gauge' + (full ? ' full' : liberi < 0 ? ' over' : '')}>
                  <div style={{ width: Math.min(100, (used / m.capienza) * 100) + '%' }} />
                </div>
                {list.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>Vuoto. Seleziona i gruppi sotto e assegnali qui.</div>}
                {list.map(a => {
                  const g = gruppi.find(x => x.id === a.gruppo_id)
                  if (!g) return null
                  const diviso = a.pax < g.pax
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{g.codice}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{g.pickup_point}</span>
                      <span className="tab-num" style={{ fontSize: 14 }}>{a.pax}{diviso ? `/${g.pax}` : ''}</span>
                      {diviso && <span className="pill pill-warn">diviso</span>}
                      <button className="no-print" onClick={() => unassign(a)} aria-label={'Togli ' + g.codice} style={{ color: 'var(--stop)', display: 'flex', padding: 4 }}><X size={15} /></button>
                    </div>
                  )
                })}
                {selected.size > 0 && (
                  <button className="btn btn-primary no-print" style={{ width: '100%', marginTop: 12 }} onClick={() => assignTo(m)} disabled={busy}>
                    Assegna qui ({selPax} pax)
                  </button>
                )}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => removeBus(m)} style={{ color: 'var(--stop)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, padding: 4 }}>
                    <Trash2 size={13} /> Elimina bus
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {addingBus ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="input-label">Taglio del bus (posti)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TAGLI.map(c => <button key={c} className="btn btn-outline tab-num" onClick={() => addBus(c)}>{c}</button>)}
              <input className="input-field" style={{ width: 90 }} type="number" inputMode="numeric" placeholder="altro"
                value={customCap} onChange={e => setCustomCap(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBus(customCap)} />
              <button className="btn btn-primary" onClick={() => addBus(customCap)} disabled={!customCap}>Ok</button>
              <button className="btn btn-ghost" onClick={() => setAddingBus(false)}>Annulla</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-outline no-print" onClick={() => setAddingBus(true)} style={{ borderStyle: 'dashed' }}><Plus size={16} /> Aggiungi bus</button>
        )}
      </div>

      <div style={{ padding: '22px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 17, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={17} /> Gruppi</div>
        <select className="input-field" style={{ width: 'auto', padding: '8px 10px', fontSize: 14 }} value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Ordina per">
          <option value="codice">A–Z codice</option>
          <option value="pax">Pax (decrescente)</option>
        </select>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> mostra assegnati
        </label>
      </div>

      {pickups.length > 1 && (
        <div className="no-print" style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto' }}>
          <button className="btn" onClick={() => setFilterPickup('')}
            style={{ padding: '6px 12px', fontSize: 13, borderRadius: 'var(--r-full)', background: !filterPickup ? 'var(--ink)' : 'var(--bg-mute)', color: !filterPickup ? 'var(--on-dark)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>Tutti</button>
          {pickups.map(([p]) => (
            <button key={p} className="btn" onClick={() => setFilterPickup(filterPickup === p ? '' : p)}
              style={{ padding: '6px 12px', fontSize: 13, borderRadius: 'var(--r-full)', background: filterPickup === p ? 'var(--ink)' : 'var(--bg-mute)', color: filterPickup === p ? 'var(--on-dark)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p}</button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gruppi.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '36px 20px' }}>
            Nessun gruppo. Premi <b>Importa</b> e carica il file: colonna A codice prenotazione, B pickup point, C pax.
          </div>
        )}
        {pickups.filter(([p]) => !filterPickup || p === filterPickup).map(([p, gs]) => {
          const visibili = gs.filter(g => showDone || restanti(g) > 0)
          const paxRest = gs.reduce((s, g) => s + restanti(g), 0)
          const isCollapsed = collapsed.has(p)
          if (!visibili.length && !showDone) return null
          return (
            <div key={p} className="card">
              <button onClick={() => {
                const c = new Set(collapsed); c.has(p) ? c.delete(p) : c.add(p); setCollapsed(c)
              }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--bg-soft)', textAlign: 'left' }}>
                <span style={{ fontWeight: 700, flex: 1 }}>{p}</span>
                <span className="tab-num" style={{ fontSize: 13, color: paxRest ? 'var(--text-secondary)' : 'var(--go)' }}>
                  {paxRest ? `${paxRest} pax` : 'completo'}
                </span>
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              {!isCollapsed && visibili.map(g => {
                const r = restanti(g)
                const isSel = selected.has(g.id)
                return (
                  <label key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                    borderTop: '1px solid var(--line)', cursor: r > 0 ? 'pointer' : 'default',
                    background: isSel ? 'var(--iv-blue-light)' : r === 0 ? 'var(--go-bg)' : 'transparent'
                  }}>
                    <input type="checkbox" disabled={r === 0} checked={isSel} style={{ width: 20, height: 20 }}
                      onChange={() => { const s = new Set(selected); s.has(g.id) ? s.delete(g.id) : s.add(g.id); setSelected(s) }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{g.codice}</span>
                    {r === 0
                      ? <span style={{ fontSize: 13, color: 'var(--go)', fontWeight: 700 }}>✓ {g.pax} pax</span>
                      : <span className="tab-num" style={{ fontSize: 14 }}>{r < g.pax ? `${r}/${g.pax}` : g.pax} pax</span>}
                  </label>
                )
              })}
            </div>
          )
        })}
      </div>

      {selected.size > 0 && (
        <div className="no-print" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: 'var(--ink)', color: 'var(--on-dark)', padding: '13px 16px calc(13px + env(safe-area-inset-bottom))',
          borderTop: '2px solid var(--signal)',
        }}>
          <div style={{ maxWidth: 608, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 14 }}>
              <b className="tab-num" style={{ color: 'var(--signal)' }}>{selected.size} gruppi · {selPax} pax</b> — tocca "Assegna qui" su un bus
            </span>
            <button className="btn btn-ghost" style={{ padding: '9px 14px', background: 'rgba(255,255,255,.1)', color: 'var(--on-dark)' }} onClick={() => setSelected(new Set())}>Svuota</button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: selected.size ? 96 : 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ink)', color: 'var(--on-dark)', padding: '11px 16px', borderRadius: 'var(--r-md)',
          fontSize: 14, zIndex: 40, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.25)'
        }}>{toast}</div>
      )}
    </div>
  )
}
