import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, Upload, Plus, Bus, Trash2, Share2, Download,
  ChevronDown, Check, X, Users, UserPlus, Wand2, AlertTriangle, MapPin, ClipboardList
} from 'lucide-react'
import { Gauge, CountNum, LiveDot, busColorStyle } from '../components/Widgets'
import { useLang } from '../lib/i18n.jsx'

const TAGLI = [50, 53, 54, 63]

export default function Transfer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const { t, lang, toggleLang } = useLang()

  const [transfer, setTransfer] = useState(null)
  const [gruppi, setGruppi] = useState([])
  const [mezzi, setMezzi] = useState([])
  const [assegnazioni, setAssegnazioni] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState(new Set())
  const [sortBy, setSortBy] = useState('codice')
  const [filterPickup, setFilterPickup] = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [collapsedBuses, setCollapsedBuses] = useState(new Set())
  const [showDone, setShowDone] = useState(false)

  const [preview, setPreview] = useState(null)
  const [showRosterPicker, setShowRosterPicker] = useState(false)
  const [activities, setActivities] = useState([])
  const [addingBus, setAddingBus] = useState(false)
  const [customCap, setCustomCap] = useState('')
  const [addingStaffFor, setAddingStaffFor] = useState(null)
  const [staffNome, setStaffNome] = useState('')
  const [staffPax, setStaffPax] = useState('1')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  function notify(msg) { setToast(msg); setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    if (!showRosterPicker) return
    supabase.from('bus_acquisti').select('attivita, pax').then(({ data }) => {
      const m = {}
      for (const a of data || []) m[a.attivita] = (m[a.attivita] || 0) + a.pax
      setActivities(Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'it')))
    })
  }, [showRosterPicker])

  async function load() {
    const [tr, g, m, a, s] = await Promise.all([
      supabase.from('bus_transfer').select('*').eq('id', id).single(),
      supabase.from('bus_gruppi').select('*').eq('transfer_id', id).order('codice'),
      supabase.from('bus_mezzi').select('*').eq('transfer_id', id).order('ordine'),
      supabase.from('bus_assegnazioni').select('*').eq('transfer_id', id),
      supabase.from('bus_staff').select('*').eq('transfer_id', id).order('created_at'),
    ])
    setTransfer(tr.data)
    setGruppi(g.data || [])
    setMezzi(m.data || [])
    setAssegnazioni(a.data || [])
    setStaff(s.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('bus-' + id)
    for (const table of ['bus_gruppi', 'bus_mezzi', 'bus_assegnazioni', 'bus_transfer', 'bus_staff']) {
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
    for (const s of staff) m[s.mezzo_id] = (m[s.mezzo_id] || 0) + s.pax
    return m
  }, [assegnazioni, staff])

  const totPax = gruppi.reduce((s, g) => s + g.pax, 0)
  const totAss = Object.values(assByGruppo).reduce((s, v) => s + v, 0)

  const pickups = useMemo(() => {
    const set = new Map()
    for (const g of gruppi) {
      const p = g.pickup_point || '(—)'
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
      const alloggio = String(r[3] ?? '').trim()
      if (!codice || !Number.isFinite(pax) || pax <= 0) continue
      if (/^codice|^cod\.|^prenotaz/i.test(codice)) continue
      parsed.push({ codice, pickup_point: pickup, pax, alloggio })
    }
    if (!parsed.length) { notify(t.tImportInvalid); return }
    setPreview(parsed)
  }

  async function confirmImport() {
    setBusy(true)
    const rows = preview.map(r => ({ ...r, transfer_id: id }))
    const { error } = await supabase.from('bus_gruppi')
      .upsert(rows, { onConflict: 'transfer_id,codice' })
    setBusy(false)
    if (error) { notify(t.tImportError(error.message)); return }
    setPreview(null)
    notify(t.tImportOk(rows.length))
    load()
  }

  async function importFromRoster(onlyPacchetto) {
    setShowRosterPicker(false)
    const { data: roster } = await supabase.from('bus_roster').select('*')
    if (!roster || !roster.length) { notify(t.rosterImportNone); return }
    const subset = onlyPacchetto ? roster.filter(r => r.escursioni) : roster
    if (!subset.length) { notify(t.rosterImportNone); return }
    setBusy(true)
    const rows = subset.map(r => ({
      transfer_id: id, codice: r.codice, pickup_point: r.pickup_point, pax: r.pax, alloggio: r.alloggio,
    }))
    const { error } = await supabase.from('bus_gruppi').upsert(rows, { onConflict: 'transfer_id,codice' })
    setBusy(false)
    if (error) { notify(t.tError(error.message)); return }
    notify(t.tRosterImportOk(rows.length))
    load()
  }

  async function importFromActivity(attivita) {
    setShowRosterPicker(false)
    const [{ data: roster }, { data: acq }] = await Promise.all([
      supabase.from('bus_roster').select('*'),
      supabase.from('bus_acquisti').select('*').eq('attivita', attivita),
    ])
    if (!acq || !acq.length) { notify(t.rosterImportNone); return }
    setBusy(true)
    const rows = acq.map(a => {
      const r = (roster || []).find(x => x.id === a.roster_id)
      return r ? { transfer_id: id, codice: r.codice, pickup_point: r.pickup_point, pax: a.pax, alloggio: r.alloggio } : null
    }).filter(Boolean)
    const { error } = await supabase.from('bus_gruppi').upsert(rows, { onConflict: 'transfer_id,codice' })
    setBusy(false)
    if (error) { notify(t.tError(error.message)); return }
    notify(t.tRosterImportOk(rows.length))
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
    if (used > 0 && !confirm(t.confirmRemoveBus(m.nome, used))) return
    await supabase.from('bus_mezzi').delete().eq('id', m.id)
    load()
  }

  async function addStaff(m) {
    const nome = staffNome.trim()
    const pax = parseInt(staffPax, 10) || 1
    if (!nome) return
    const liberi = m.capienza - (usedByMezzo[m.id] || 0)
    if (pax > liberi) { notify(t.tStaffNoRoom(liberi, m.nome)); return }
    setBusy(true)
    const { error } = await supabase.from('bus_staff').insert({ transfer_id: id, mezzo_id: m.id, nome, pax })
    setBusy(false)
    if (error) { notify(t.tError(error.message)); return }
    setAddingStaffFor(null); setStaffNome(''); setStaffPax('1')
    load()
  }

  async function removeStaff(s) {
    await supabase.from('bus_staff').delete().eq('id', s.id)
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
      if (error) { notify(t.tError(error.message)); return }
      setSelected(new Set())
      notify(t.tAssignOk(tot, m.nome, liberi - tot))
      load()
      return
    }

    notify(t.tNoRoom(tot, liberi, m.nome))
  }

  async function unassign(a) {
    await supabase.from('bus_assegnazioni').delete().eq('id', a.id)
    load()
  }

  async function autoFill() {
    const liberiMap = {}
    for (const m of mezzi) liberiMap[m.id] = m.capienza - (usedByMezzo[m.id] || 0)
    const existingPairs = new Set(assegnazioni.map(a => a.gruppo_id + '|' + a.mezzo_id))
    const daAssegnare = gruppi.map(g => ({ ...g, rest: restanti(g) })).filter(g => g.rest > 0).sort((a, b) => b.rest - a.rest)
    const busiOrdinati = [...mezzi].sort((a, b) => a.ordine - b.ordine)
    const planned = []
    let nonPiazzati = 0

    for (const g of daAssegnare) {
      const rimasto = g.rest
      const interi = busiOrdinati.filter(m => liberiMap[m.id] >= rimasto && !existingPairs.has(g.id + '|' + m.id))
      if (interi.length) {
        interi.sort((a, b) => liberiMap[a.id] - liberiMap[b.id])
        const m = interi[0]
        planned.push({ transfer_id: id, gruppo_id: g.id, mezzo_id: m.id, pax: rimasto })
        liberiMap[m.id] -= rimasto
        existingPairs.add(g.id + '|' + m.id)
        continue
      }
      nonPiazzati += rimasto
    }

    if (!planned.length) { notify(nonPiazzati > 0 ? t.tAutoNoRoom(nonPiazzati) : t.tAutoNothing); return }
    setBusy(true)
    const { error } = await supabase.from('bus_assegnazioni').insert(planned)
    setBusy(false)
    if (error) { notify(t.tError(error.message)); return }
    setSelected(new Set())
    const piazzati = planned.reduce((s, p) => s + p.pax, 0)
    notify(nonPiazzati > 0 ? t.tAutoPartial(piazzati, nonPiazzati) : t.tAutoOk(piazzati))
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
    navigator.clipboard?.writeText(url).then(() => notify(t.tLinkCopied))
      .catch(() => notify(url))
  }

  function exportXlsx() {
    const wb = XLSX.utils.book_new()
    const aoa = []
    aoa.push(['INVIBE BUS', transfer?.nome || '', '', ''])
    aoa.push([])
    for (const m of mezzi) {
      const rows = assegnazioni.filter(a => a.mezzo_id === m.id).map(a => {
        const g = gruppi.find(x => x.id === a.gruppo_id)
        return [g?.codice || '', g?.pickup_point || '', g?.alloggio || '', a.pax]
      }).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'it'))
      for (const s of staff.filter(s => s.mezzo_id === m.id)) {
        rows.push(['STAFF · ' + s.nome, '', '', s.pax])
      }
      const tot = rows.reduce((s, r) => s + r[3], 0)
      const stopsMap = {}
      for (const a of assegnazioni.filter(a => a.mezzo_id === m.id)) {
        const g = gruppi.find(x => x.id === a.gruppo_id)
        if (!g) continue
        const key = g.pickup_point || '(—)'
        stopsMap[key] = (stopsMap[key] || 0) + a.pax
      }
      const tratta = Object.entries(stopsMap).sort((a, b) => a[0].localeCompare(b[0], 'it')).map(([p, pax]) => `${p} (${pax})`).join(' · ')
      aoa.push([m.nome.toUpperCase(), '', '', `${tot}/${m.capienza}`])
      if (tratta) aoa.push([t.trattaLabel, tratta, '', ''])
      aoa.push(['Codice', 'Pickup point', 'Alloggio', 'Pax'])
      for (const r of rows) aoa.push(r)
      aoa.push(['TOTALE', '', '', tot])
      aoa.push([])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Bus')

    const rest = gruppi.filter(g => restanti(g) > 0).map(g => ({ Codice: g.codice, 'Pickup point': g.pickup_point, Alloggio: g.alloggio || '', Pax: restanti(g) }))
    if (rest.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rest), 'Non assegnati')

    XLSX.writeFile(wb, (transfer?.nome || 'transfer').replace(/[^\w\s-]/g, '') + ' - bus.xlsx')
  }

  if (loading) return (
    <div className="shell" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1].map(i => <div key={i} className="skeleton" style={{ height: 120, animationDelay: (i * 90) + 'ms' }} />)}
    </div>
  )
  if (!transfer) return <div style={{ padding: 40, textAlign: 'center' }}>{t.notFound}</div>

  const totStaffPax = staff.reduce((s, x) => s + x.pax, 0)
  const totCapienza = mezzi.reduce((s, m) => s + m.capienza, 0)
  const totUsedFlotta = totAss + totStaffPax
  const liberiFlotta = totCapienza - totUsedFlotta
  const pctFlotta = totCapienza ? Math.min(100, (totUsedFlotta / totCapienza) * 100) : 0
  const flottaPiena = totCapienza > 0 && liberiFlotta <= 0
  const anyGroupVisible = pickups.some(([p, gs]) => {
    if (filterPickup && p !== filterPickup) return false
    return gs.some(g => showDone || restanti(g) > 0)
  })

  return (
    <div className="shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: selected.size ? 140 : 24 }}>

      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate('/')} aria-label={t.back} style={{ display: 'flex' }}><ArrowLeft size={16} /></button>
        <span style={{ flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transfer.nome}</span>
        <span className="sub">
          <LiveDot /> <CountNum value={liberiFlotta} /> {t.liberi.toLowerCase()}
          <button className="lang-toggle no-print" onClick={toggleLang} aria-label="Cambia lingua / Change language">
            {lang === 'it' ? 'EN' : 'IT'}
          </button>
        </span>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <Gauge pct={pctFlotta} tone={flottaPiena ? 'full' : liberiFlotta < 0 ? 'over' : ''} style={{ height: 11 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 7, fontFamily: 'var(--mono)' }}>
          <span style={{ color: flottaPiena ? 'var(--go)' : liberiFlotta < 0 ? 'var(--stop)' : 'var(--text-secondary)' }}>
            {totCapienza === 0
              ? t.noBusYet
              : flottaPiena
                ? t.fleetFull
                : liberiFlotta < 0
                  ? t.overCapacity(Math.abs(liberiFlotta))
                  : <><CountNum value={liberiFlotta} /> {t.freeInFleetSuffix}</>}
          </span>
          <span>{t.busesCount(mezzi.length, totCapienza)}</span>
        </div>
      </div>

      {totCapienza > 0 && totPax > totCapienza && (
        <div className="no-print" style={{
          margin: '12px 16px 0', padding: '11px 14px', background: 'var(--stop-bg)', color: 'var(--stop)',
          borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'flex-start', gap: 9,
        }}>
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t.capacityAlert(totPax - totCapienza, totPax, totCapienza)}</span>
        </div>
      )}

      <div className="no-print" style={{ display: 'flex', gap: 8, padding: '14px 16px', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> {t.importBtn}</button>
        <button className="btn btn-outline" onClick={() => setShowRosterPicker(v => !v)}><ClipboardList size={16} /> {t.rosterImportFromRoster}</button>
        <button className="btn btn-outline" onClick={autoFill} disabled={busy || !mezzi.length || totPax - totAss <= 0}>
          <Wand2 size={16} /> {t.autoFillBtn}
        </button>
        <button className="btn btn-outline" onClick={toggleShare} style={transfer.condiviso ? { background: 'var(--go-bg)', color: 'var(--go)', borderColor: 'transparent' } : {}}>
          <Share2 size={16} /> {transfer.condiviso ? t.linkActiveBtn : t.shareBtn}
        </button>
        {transfer.condiviso && <button className="btn btn-outline" onClick={copyLink}>{t.copyLinkBtn}</button>}
        <button className="btn btn-outline" onClick={exportXlsx} disabled={!mezzi.length}><Download size={16} /> {t.excelBtn}</button>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />

      {showRosterPicker && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{t.rosterImportPickTitle}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => importFromRoster(false)} disabled={busy}>{t.rosterImportAll}</button>
              <button className="btn btn-outline" onClick={() => importFromRoster(true)} disabled={busy}>{t.rosterImportPackage}</button>
              {activities.map(([nome, pax]) => (
                <button key={nome} className="btn btn-outline" onClick={() => importFromActivity(nome)} disabled={busy}>
                  {t.importFromActivity(nome)} · {pax}
                </button>
              ))}
              <button className="btn btn-ghost" onClick={() => setShowRosterPicker(false)}>{t.cancelBtn}</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.previewTitle(preview.length, preview.reduce((s, r) => s + r.pax, 0))}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{t.previewDesc}</div>
            <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 13, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
              {preview.slice(0, 60).map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)' }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.codice}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.pickup_point || '—'}</span>
                  {r.alloggio && <span style={{ flex: 1, color: 'var(--text-tertiary)', fontSize: 12 }}>{r.alloggio}</span>}
                  <span>{r.pax} {t.paxUnit}</span>
                </div>
              ))}
              {preview.length > 60 && <div style={{ padding: 8, color: 'var(--text-tertiary)' }}>{t.andOthers(preview.length - 60)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmImport} disabled={busy}><Check size={16} /> {t.previewImportBtn}</button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}><X size={16} /> {t.cancelBtn}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '22px 16px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 17, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={17} /> {t.groupsTitle}</div>
        <select className="input-field" style={{ width: 'auto', padding: '8px 10px', fontSize: 14 }} value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="sort">
          <option value="codice">{t.sortAZ}</option>
          <option value="pax">{t.sortPax}</option>
        </select>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> {t.showAssigned}
        </label>
      </div>

      {gruppi.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px 20px 8px' }}>
          {t.emptyGroupsMsg}
        </div>
      )}

      <div className={'transfer-layout' + (anyGroupVisible ? ' split' : '')}>
      <div className="bus-col" style={{ minWidth: 0 }}>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mezzi.map((m, i) => {
          const used = usedByMezzo[m.id] || 0
          const liberi = m.capienza - used
          const list = assegnazioni.filter(a => a.mezzo_id === m.id)
          const full = liberi === 0
          const staffQui = staff.filter(s => s.mezzo_id === m.id)
          const busOpen = !collapsedBuses.has(m.id)
          const stopsMap = {}
          for (const a of list) {
            const g = gruppi.find(x => x.id === a.gruppo_id)
            if (!g) continue
            const key = g.pickup_point || '(—)'
            stopsMap[key] = (stopsMap[key] || 0) + a.pax
          }
          const stops = Object.entries(stopsMap).sort((a, b) => a[0].localeCompare(b[0], 'it'))
          return (
            <div key={m.id} className="stub enter" style={{ '--d': (i * 55) + 'ms' }}>
              <div className="stub-head">
                <button onClick={() => { const c = new Set(collapsedBuses); c.has(m.id) ? c.delete(m.id) : c.add(m.id); setCollapsedBuses(c) }}
                  style={{ display: 'flex', alignItems: 'stretch', width: '100%', textAlign: 'left' }}>
                  <div className={'stub-tag stub-tag--colored' + (full ? ' stub-tag--done' : liberi < 0 ? ' stub-tag--danger' : '')}
                    style={busColorStyle(i)}>
                    <span className="lbl">{full ? t.pieno : t.liberi}</span>
                    <span className="num"><CountNum value={liberi} /></span>
                  </div>
                  <div className="stub-head-body">
                    <span className="name">{m.nome}</span>
                    <span className="meta"><CountNum value={used} />/{m.capienza} {t.seatsOccupied}</span>
                    {stops.length > 0 && (
                      <span className="meta" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                        <MapPin size={11} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stops.map(([p, pax]) => `${p} (${pax})`).join(' · ')}
                        </span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', flexShrink: 0 }}>
                    <ChevronDown size={18} style={{ transition: 'transform .25s ease', transform: busOpen ? 'rotate(180deg)' : 'none', color: 'var(--on-dark-dim)' }} />
                  </div>
                </button>
              </div>
              <div className={'acc' + (busOpen ? ' open' : '')}>
                <div style={{ padding: 14 }}>
                <Gauge pct={(used / m.capienza) * 100} tone={full ? 'full' : liberi < 0 ? 'over' : ''} />
                {list.length === 0 && staffQui.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>{t.emptyBusMsg}</div>}
                {list.map(a => {
                  const g = gruppi.find(x => x.id === a.gruppo_id)
                  if (!g) return null
                  const diviso = a.pax < g.pax
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600 }}>{g.codice}</span>
                        {g.alloggio && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{g.alloggio}</span>}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{g.pickup_point}</span>
                      <span className="tab-num" style={{ fontSize: 14 }}>{a.pax}{diviso ? `/${g.pax}` : ''}</span>
                      {diviso && <span className="pill pill-warn">{t.diviso}</span>}
                      <button className="no-print" onClick={() => unassign(a)} aria-label={t.deleteBtn + ' ' + g.codice} style={{ color: 'var(--stop)', display: 'flex', padding: 4 }}><X size={15} /></button>
                    </div>
                  )
                })}
                {staffQui.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                    <span className="pill pill-signal">{t.staffPill}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{s.nome}</span>
                    <span className="tab-num" style={{ fontSize: 14 }}>{s.pax}</span>
                    <button className="no-print" onClick={() => removeStaff(s)} aria-label={t.deleteBtn + ' ' + s.nome} style={{ color: 'var(--stop)', display: 'flex', padding: 4 }}><X size={15} /></button>
                  </div>
                ))}

                {selected.size > 0 && (
                  <button className="btn btn-primary no-print" style={{ width: '100%', marginTop: 12 }} onClick={() => assignTo(m)} disabled={busy}>
                    {t.assignHereBtn(selPax)}
                  </button>
                )}

                {addingStaffFor === m.id ? (
                  <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <input className="input-field" style={{ flex: 1, minWidth: 120 }} placeholder={t.staffNamePlaceholder} value={staffNome}
                      onChange={e => setStaffNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && addStaff(m)} />
                    <input className="input-field" style={{ width: 64 }} type="number" min="1" inputMode="numeric" value={staffPax}
                      onChange={e => setStaffPax(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStaff(m)} />
                    <button className="btn btn-primary" onClick={() => addStaff(m)} disabled={!staffNome.trim() || busy}>{t.okBtn}</button>
                    <button className="btn btn-ghost" onClick={() => { setAddingStaffFor(null); setStaffNome(''); setStaffPax('1') }}>{t.cancelBtn}</button>
                  </div>
                ) : (
                  <button className="btn btn-outline no-print" style={{ width: '100%', marginTop: 12 }}
                    onClick={() => { setAddingStaffFor(m.id); setStaffNome(''); setStaffPax('1') }}>
                    <UserPlus size={15} /> {t.addStaffBtn}
                  </button>
                )}

                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button onClick={() => removeBus(m)} style={{ color: 'var(--stop)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, padding: 4 }}>
                    <Trash2 size={13} /> {t.deleteBusBtn}
                  </button>
                </div>
                </div>
              </div>
            </div>
          )
        })}

        {addingBus ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="input-label">{t.busSizeLabel}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TAGLI.map(c => <button key={c} className="btn btn-outline tab-num" onClick={() => addBus(c)}>{c}</button>)}
              <input className="input-field" style={{ width: 90 }} type="number" inputMode="numeric" placeholder={t.otherPlaceholder}
                value={customCap} onChange={e => setCustomCap(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBus(customCap)} />
              <button className="btn btn-primary" onClick={() => addBus(customCap)} disabled={!customCap}>{t.okBtn}</button>
              <button className="btn btn-ghost" onClick={() => setAddingBus(false)}>{t.cancelBtn}</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-outline no-print" onClick={() => setAddingBus(true)} style={{ borderStyle: 'dashed' }}><Plus size={16} /> {t.addBusBtn}</button>
        )}
      </div>
      </div>

      {anyGroupVisible && (
      <div className="groups-col" style={{ minWidth: 0 }}>

      {pickups.length > 1 && (
        <div className="no-print" style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto' }}>
          <button className="btn" onClick={() => setFilterPickup('')}
            style={{ padding: '6px 12px', fontSize: 13, borderRadius: 'var(--r-full)', background: !filterPickup ? 'var(--ink)' : 'var(--bg-mute)', color: !filterPickup ? 'var(--on-dark)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{t.allFilter}</button>
          {pickups.map(([p]) => (
            <button key={p} className="btn" onClick={() => setFilterPickup(filterPickup === p ? '' : p)}
              style={{ padding: '6px 12px', fontSize: 13, borderRadius: 'var(--r-full)', background: filterPickup === p ? 'var(--ink)' : 'var(--bg-mute)', color: filterPickup === p ? 'var(--on-dark)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p}</button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pickups.filter(([p]) => !filterPickup || p === filterPickup).map(([p, gs], idx) => {
          const visibili = gs.filter(g => showDone || restanti(g) > 0)
          const paxRest = gs.reduce((s, g) => s + restanti(g), 0)
          const isOpen = !collapsed.has(p)
          if (!visibili.length && !showDone) return null
          return (
            <div key={p} className="card enter" style={{ '--d': (idx * 40) + 'ms' }}>
              <button onClick={() => {
                const c = new Set(collapsed); c.has(p) ? c.delete(p) : c.add(p); setCollapsed(c)
              }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--bg-soft)', textAlign: 'left' }}>
                <span style={{ fontWeight: 700, flex: 1 }}>{p}</span>
                <span className="tab-num" style={{ fontSize: 13, color: paxRest ? 'var(--text-secondary)' : 'var(--go)' }}>
                  {paxRest ? t.paxDaAssegnare(paxRest) : t.complete}
                </span>
                <ChevronDown size={16} style={{ transition: 'transform .25s ease', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              <div className={'acc' + (isOpen ? ' open' : '')}>
                <div>
                  {visibili.map(g => {
                    const r = restanti(g)
                    const isSel = selected.has(g.id)
                    return (
                      <label key={g.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                        borderTop: '1px solid var(--line)', cursor: r > 0 ? 'pointer' : 'default',
                        background: isSel ? 'var(--iv-blue-light)' : r === 0 ? 'var(--go-bg)' : 'transparent',
                        transition: 'background .18s ease',
                      }}>
                        <input type="checkbox" disabled={r === 0} checked={isSel} style={{ width: 20, height: 20 }}
                          onChange={() => { const s = new Set(selected); s.has(g.id) ? s.delete(g.id) : s.add(g.id); setSelected(s) }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{g.codice}</span>
                          {g.alloggio && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{g.alloggio}</span>}
                        </span>
                        {r === 0
                          ? <span style={{ fontSize: 13, color: 'var(--go)', fontWeight: 700 }}>✓ {g.pax} {t.paxUnit}</span>
                          : <span className="tab-num" style={{ fontSize: 14 }}>{r < g.pax ? `${r}/${g.pax}` : g.pax} {t.paxUnit}</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      </div>
      )}
      </div>

      {selected.size > 0 && (
        <div className="no-print enter" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: 'var(--ink)', color: 'var(--on-dark)', padding: '13px 16px calc(13px + env(safe-area-inset-bottom))',
          borderTop: '2px solid var(--signal)',
        }}>
          <div style={{ maxWidth: 608, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, fontSize: 14 }}>
              <b className="tab-num" style={{ color: 'var(--signal)' }}>{t.selectionBar(selected.size, selPax)}</b> {t.selectionHint}
            </span>
            <button className="btn btn-ghost" style={{ padding: '9px 14px', background: 'rgba(255,255,255,.1)', color: 'var(--on-dark)' }} onClick={() => setSelected(new Set())}>{t.emptySelBtn}</button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="toast-in" style={{
          position: 'fixed', bottom: selected.size ? 96 : 20, left: '50%',
          background: 'var(--ink)', color: 'var(--on-dark)', padding: '11px 16px', borderRadius: 'var(--r-md)',
          fontSize: 14, zIndex: 40, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.25)'
        }}>{toast}</div>
      )}
    </div>
  )
}
