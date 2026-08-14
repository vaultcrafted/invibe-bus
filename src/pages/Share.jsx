import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Bus, Printer, RefreshCw, MapPin } from 'lucide-react'
import { Gauge, CountNum, LiveDot, busColorStyle } from '../components/Widgets'
import { useLang } from '../lib/i18n.jsx'

export default function Share() {
  const { id } = useParams()
  const { t, lang, toggleLang } = useLang()
  const [transfer, setTransfer] = useState(undefined)
  const [gruppi, setGruppi] = useState([])
  const [mezzi, setMezzi] = useState([])
  const [assegnazioni, setAssegnazioni] = useState([])
  const [staff, setStaff] = useState([])
  const [updatedAt, setUpdatedAt] = useState(null)

  async function load() {
    const [tr, g, m, a, s] = await Promise.all([
      supabase.from('bus_transfer').select('*').eq('id', id).maybeSingle(),
      supabase.from('bus_gruppi').select('*').eq('transfer_id', id),
      supabase.from('bus_mezzi').select('*').eq('transfer_id', id).order('ordine'),
      supabase.from('bus_assegnazioni').select('*').eq('transfer_id', id),
      supabase.from('bus_staff').select('*').eq('transfer_id', id),
    ])
    setTransfer(tr.data ?? null)
    setGruppi(g.data || [])
    setMezzi(m.data || [])
    setAssegnazioni(a.data || [])
    setStaff(s.data || [])
    setUpdatedAt(new Date())
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('share-' + id)
    for (const table of ['bus_gruppi', 'bus_mezzi', 'bus_assegnazioni', 'bus_staff']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `transfer_id=eq.${id}` }, () => load())
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  const gruppoById = useMemo(() => {
    const m = {}
    for (const g of gruppi) m[g.id] = g
    return m
  }, [gruppi])

  const nonAssegnati = useMemo(() => {
    const ass = {}
    for (const a of assegnazioni) ass[a.gruppo_id] = (ass[a.gruppo_id] || 0) + a.pax
    return gruppi
      .map(g => ({ ...g, restanti: g.pax - (ass[g.id] || 0) }))
      .filter(g => g.restanti > 0)
      .sort((a, b) => a.codice.localeCompare(b.codice, 'it'))
  }, [gruppi, assegnazioni])

  const LangBtn = () => (
    <button className="lang-toggle no-print" onClick={toggleLang} aria-label="Cambia lingua / Change language">
      {lang === 'it' ? 'EN' : 'IT'}
    </button>
  )

  if (transfer === undefined) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: 'var(--mono)', fontSize: 13 }}>{t.loading}</div>
  }

  if (transfer === null) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
        <div className="board-strip" style={{ borderRadius: 'var(--r-md)', justifyContent: 'center', marginBottom: 20, gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bus size={15} className="flag" /> {t.appName}</span>
          <LangBtn />
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{t.linkNotActiveTitle}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 15 }}>{t.linkNotActiveDesc}</div>
      </div>
    )
  }

  const totPax = gruppi.reduce((s, g) => s + g.pax, 0)
  const totAss = assegnazioni.reduce((s, a) => s + a.pax, 0)
  const totStaffPax = staff.reduce((s, x) => s + x.pax, 0)
  const totCapienza = mezzi.reduce((s, m) => s + m.capienza, 0)
  const liberiFlotta = totCapienza - totAss - totStaffPax

  return (
    <div className="shell" style={{ flex: 1, paddingBottom: 32 }}>

      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <span>{t.appName}</span>
        <span style={{ flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transfer.nome}</span>
        <span className="sub"><LiveDot /> <CountNum value={liberiFlotta} /> {t.liberi.toLowerCase()} <LangBtn /></span>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, padding: '14px 16px', alignItems: 'center' }}>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> {t.printBtn}</button>
        <button className="btn btn-outline" onClick={load}><RefreshCw size={16} /> {t.refreshBtn}</button>
        {updatedAt && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--mono)' }}>
            {t.updatedAt(updatedAt.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' }))}
          </span>
        )}
      </div>

      <div className="cards-grid" style={{ padding: '0 16px' }}>
        {mezzi.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '36px 20px' }}>{t.emptyBuses}</div>
        )}

        {mezzi.map((m, i) => {
          const list = assegnazioni
            .filter(a => a.mezzo_id === m.id)
            .map(a => ({ ...a, g: gruppoById[a.gruppo_id] }))
            .filter(a => a.g)
            .sort((a, b) =>
              (a.g.pickup_point || '').localeCompare(b.g.pickup_point || '', 'it') ||
              a.g.codice.localeCompare(b.g.codice, 'it'))
          const staffQui = staff.filter(s => s.mezzo_id === m.id)
          const used = list.reduce((s, a) => s + a.pax, 0) + staffQui.reduce((s, x) => s + x.pax, 0)
          const liberi = m.capienza - used
          const full = liberi <= 0
          const stopsMap = {}
          for (const a of list) {
            const key = a.g.pickup_point || '(—)'
            stopsMap[key] = (stopsMap[key] || 0) + a.pax
          }
          const stops = Object.entries(stopsMap).sort((a, b) => a[0].localeCompare(b[0], 'it'))
          return (
            <div key={m.id} className="stub enter" style={{ '--d': (i * 55) + 'ms' }}>
              <div className="stub-head">
                <div className={'stub-tag stub-tag--colored' + (full ? ' stub-tag--done' : '')}
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
              </div>
              <div style={{ padding: '6px 14px 12px' }}>
                <div style={{ marginBottom: 10 }}><Gauge pct={(used / m.capienza) * 100} tone={full ? 'full' : ''} /></div>
                {list.length === 0 && staffQui.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '10px 0' }}>{t.emptyBusList}</div>}
                {list.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                    <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.g.codice}
                      {a.g.alloggio && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--text-tertiary)' }}>{a.g.alloggio}</span>}
                    </span>
                    <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'right' }}>{a.g.pickup_point}</span>
                    <span className="tab-num" style={{ minWidth: 34, textAlign: 'right' }}>{a.pax}</span>
                  </div>
                ))}
                {staffQui.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                    <span className="pill pill-signal">{t.staffPill}</span>
                    <span style={{ flex: 1, fontWeight: 600, textAlign: 'right' }}>{s.nome}</span>
                    <span className="tab-num" style={{ minWidth: 34, textAlign: 'right' }}>{s.pax}</span>
                  </div>
                ))}
                {(list.length > 0 || staffQui.length > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 11, fontWeight: 700, fontSize: 14 }}>
                    <span>{t.totalLabel}</span><span className="tab-num">{used} {t.paxUnit}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {nonAssegnati.length > 0 && (
          <div className="card">
            <div style={{ padding: '12px 14px', background: 'var(--warn-bg)', color: 'var(--warn)', fontWeight: 700, fontSize: 14 }}>
              {t.remainingTitle(nonAssegnati.reduce((s, g) => s + g.restanti, 0))}
            </div>
            <div style={{ padding: '4px 14px 12px' }}>
              {nonAssegnati.map(g => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{g.codice}</span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'right' }}>{g.pickup_point}</span>
                  <span className="tab-num" style={{ minWidth: 34, textAlign: 'right' }}>{g.restanti}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
