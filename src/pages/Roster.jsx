import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Upload, Search, Trash2, Check, X, Users } from 'lucide-react'
import { useLang } from '../lib/i18n.jsx'

export default function Roster() {
  const navigate = useNavigate()
  const { t, lang, toggleLang } = useLang()
  const fileRef = useRef(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  function notify(msg) { setToast(msg); setTimeout(() => setToast(''), 2600) }

  async function load() {
    const { data } = await supabase.from('bus_roster').select('*').order('codice')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('roster')
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bus_roster' }, () => load())
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(r => r.codice.toLowerCase().includes(query) || (r.pickup_point || '').toLowerCase().includes(query))
  }, [rows, q])

  const totPax = rows.reduce((s, r) => s + r.pax, 0)
  const totPacchetto = rows.filter(r => r.escursioni).length

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
    const parsed = []
    for (const r of data) {
      const codice = String(r[0] ?? '').trim()
      const pickup = String(r[1] ?? '').trim()
      const pax = parseInt(r[2], 10)
      const alloggio = String(r[3] ?? '').trim()
      const pkgRaw = String(r[4] ?? '').trim().toLowerCase()
      const escursioni = ['si', 'sì', 'yes', 'y', '1', 'x', 'true'].includes(pkgRaw)
      if (!codice || !Number.isFinite(pax) || pax <= 0) continue
      if (/^codice|^cod\.|^prenotaz/i.test(codice)) continue
      parsed.push({ codice, pickup_point: pickup, pax, alloggio, escursioni })
    }
    if (!parsed.length) { notify(t.tImportInvalid); return }
    setPreview(parsed)
  }

  async function confirmImport() {
    setBusy(true)
    const { error } = await supabase.from('bus_roster')
      .upsert(preview.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'codice' })
    setBusy(false)
    if (error) { notify(t.tError(error.message)); return }
    notify(t.tRosterUploadOk(preview.length))
    setPreview(null)
    load()
  }

  async function togglePkg(r) {
    await supabase.from('bus_roster').update({ escursioni: !r.escursioni, updated_at: new Date().toISOString() }).eq('id', r.id)
  }

  async function remove(r) {
    if (!confirm(t.rosterDeleteConfirm(r.codice))) return
    await supabase.from('bus_roster').delete().eq('id', r.id)
  }

  return (
    <div className="shell" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate('/')} aria-label={t.back} style={{ display: 'flex' }}><ArrowLeft size={16} /></button>
        <span style={{ flex: 1, textAlign: 'center' }}>{t.rosterBackHome}</span>
        <span className="sub">
          {rows.length}
          <button className="lang-toggle no-print" onClick={toggleLang} aria-label="Cambia lingua / Change language">
            {lang === 'it' ? 'EN' : 'IT'}
          </button>
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="enter">
          <div style={{ fontSize: 20, fontWeight: 800 }}>{t.rosterTitle}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 3 }}>{t.rosterSubtitle}</div>
        </div>

        {rows.length > 0 && (
          <div className="stats-grid">
            <div className="card enter" style={{ padding: 14 }}>
              <div className="tab-num" style={{ fontSize: 24, fontWeight: 800 }}>{rows.length}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 4 }}>{t.groupsTitle}</div>
            </div>
            <div className="card enter" style={{ padding: 14 }}>
              <div className="tab-num" style={{ fontSize: 24, fontWeight: 800 }}>{totPax}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 4 }}>{t.paxUnit}</div>
            </div>
            <div className="card enter" style={{ padding: 14 }}>
              <div className="tab-num" style={{ fontSize: 24, fontWeight: 800, color: 'var(--iv-blue-dark)' }}>{totPacchetto}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 4 }}>{t.rosterPackageOn}</div>
            </div>
          </div>
        )}

        <button className="btn btn-outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> {t.rosterUpload}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: -6 }}>{t.rosterColPackageHint}</div>

        {preview && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.rosterPreviewTitle(preview.length, preview.reduce((s, r) => s + r.pax, 0))}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{t.rosterPreviewDesc}</div>
            <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 13, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
              {preview.slice(0, 80).map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)' }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.codice}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.pickup_point || '—'}</span>
                  <span>{r.pax}</span>
                  {r.escursioni && <span className="pill pill-blue">{t.rosterPackageOn}</span>}
                </div>
              ))}
              {preview.length > 80 && <div style={{ padding: 8, color: 'var(--text-tertiary)' }}>{t.andOthers(preview.length - 80)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmImport} disabled={busy}><Check size={16} /> {t.rosterConfirmImport}</button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}><X size={16} /> {t.cancelBtn}</button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-tertiary)' }} />
            <input className="input-field" style={{ paddingLeft: 36 }} placeholder={t.rosterSearch} value={q} onChange={e => setQ(e.target.value)} />
          </div>
        )}

        {loading && <div className="skeleton" style={{ height: 200 }} />}

        {!loading && rows.length === 0 && (
          <div className="enter" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 24px' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{t.rosterEmpty}</div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="card">
            {filtered.map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{r.codice}</span>
                  {r.alloggio && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{r.alloggio}</span>}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{r.pickup_point}</span>
                <span className="tab-num" style={{ fontSize: 14, flexShrink: 0 }}>{r.pax}</span>
                <button onClick={() => togglePkg(r)} aria-label={t.rosterTogglePackage}
                  className={'pill ' + (r.escursioni ? 'pill-blue' : 'pill-neutral')} style={{ flexShrink: 0 }}>
                  <Users size={11} /> {r.escursioni ? t.rosterPackageOn : '—'}
                </button>
                <button onClick={() => remove(r)} aria-label={t.deleteBtn + ' ' + r.codice} style={{ color: 'var(--stop)', display: 'flex', padding: 4, flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div role="status" className="toast-in" style={{
          position: 'fixed', bottom: 20, left: '50%',
          background: 'var(--ink)', color: 'var(--on-dark)', padding: '11px 16px', borderRadius: 'var(--r-md)',
          fontSize: 14, zIndex: 40, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.25)'
        }}>{toast}</div>
      )}
    </div>
  )
}
