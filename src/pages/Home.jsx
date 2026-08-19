import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Bus, ChevronRight, Trash2, Users, Share2, UserPlus, Activity, ClipboardList, HelpCircle, ChevronLeft } from 'lucide-react'
import { Gauge, CountNum, LiveDot, StatCard, FleetDonut, HelpModal } from '../components/Widgets'
import { useLang } from '../lib/i18n.jsx'
import { useMode } from '../lib/mode.jsx'
import { useTurno } from '../lib/turno.jsx'

export default function Home() {
  const navigate = useNavigate()
  const { t, lang, toggleLang } = useLang()
  const { agency, homePath, transferPath } = useMode()
  const turno = useTurno()
  const [showHelp, setShowHelp] = useState(false)
  const [transfers, setTransfers] = useState([])
  const [stats, setStats] = useState({})
  const [totMezzi, setTotMezzi] = useState(0)
  const [totCapienza, setTotCapienza] = useState(0)
  const [totUsedFlotta, setTotUsedFlotta] = useState(0)
  const [totRosterPax, setTotRosterPax] = useState(0)
  const [activity, setActivity] = useState([])
  const [creating, setCreating] = useState(false)
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)

  function saluto() {
    const h = new Date().getHours()
    if (h < 6) return t.greetingNight
    if (h < 12) return t.greetingMorning
    if (h < 18) return t.greetingAfternoon
    return t.greetingEvening
  }

  function fmtData(iso) {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return t.today
    const yest = new Date(now); yest.setDate(now.getDate() - 1)
    if (d.toDateString() === yest.toDateString()) return t.yesterday
    return d.toLocaleDateString(t.locale, { day: '2-digit', month: 'short' })
  }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return t.timeNow
    if (diff < 3600) return t.timeMin(Math.floor(diff / 60))
    if (diff < 86400) return t.timeH(Math.floor(diff / 3600))
    return t.timeD(Math.floor(diff / 86400))
  }

  function statusOf(s) {
    if (s.tot === 0) return { label: t.statusImportare, tone: 'pill-neutral', tag: 'stub-tag--neutral' }
    if (s.ass >= s.tot) return { label: t.statusCompletato, tone: 'pill-go', tag: 'stub-tag--full' }
    if (s.ass > 0) return { label: t.statusInCorso, tone: 'pill-blue', tag: '' }
    return { label: t.statusDaAssegnare, tone: 'pill-warn', tag: 'stub-tag--warn' }
  }

  async function load() {
    const { data } = await supabase.from('bus_transfer').select('*').eq('turno_id', turno.id).order('created_at', { ascending: false })
    setTransfers(data || [])
    const ids = (data || []).map(t2 => t2.id)
    const transferById = {}
    for (const t2 of data || []) transferById[t2.id] = t2.nome

    const { data: roster } = await supabase.from('bus_roster').select('pax').eq('turno_id', turno.id)
    setTotRosterPax((roster || []).reduce((s, r) => s + r.pax, 0))

    if (ids.length) {
      const [g, a, m, st] = await Promise.all([
        supabase.from('bus_gruppi').select('id, transfer_id, codice, pax').in('transfer_id', ids),
        supabase.from('bus_assegnazioni').select('id, transfer_id, gruppo_id, mezzo_id, pax, created_at').in('transfer_id', ids),
        supabase.from('bus_mezzi').select('id, transfer_id, nome, capienza, created_at').in('transfer_id', ids),
        supabase.from('bus_staff').select('id, transfer_id, mezzo_id, nome, pax, created_at').in('transfer_id', ids),
      ])
      const s = {}
      for (const id of ids) s[id] = { tot: 0, ass: 0 }
      for (const r of g.data || []) s[r.transfer_id].tot += r.pax
      for (const r of a.data || []) s[r.transfer_id].ass += r.pax
      setStats(s)
      setTotMezzi((m.data || []).length)
      setTotCapienza((m.data || []).reduce((acc, r) => acc + r.capienza, 0))
      const staffPax = (st.data || []).reduce((acc, r) => acc + r.pax, 0)
      const assPax = (a.data || []).reduce((acc, r) => acc + r.pax, 0)
      setTotUsedFlotta(assPax + staffPax)

      const gruppoById = {}
      for (const r of g.data || []) gruppoById[r.id] = r.codice
      const mezzoById = {}
      for (const r of m.data || []) mezzoById[r.id] = r.nome

      const events = []
      for (const r of m.data || []) events.push({ at: r.created_at, icon: Bus, tone: 'blue', text: t.actBus(r.nome, transferById[r.transfer_id] || t.unnamed) })
      for (const r of a.data || []) events.push({ at: r.created_at, icon: Users, tone: 'go', text: t.actAssign(r.pax, gruppoById[r.gruppo_id] || '?', mezzoById[r.mezzo_id] || 'bus', transferById[r.transfer_id] || t.unnamed) })
      for (const r of st.data || []) events.push({ at: r.created_at, icon: UserPlus, tone: 'signal', text: t.actStaff(r.nome, mezzoById[r.mezzo_id] || 'bus', transferById[r.transfer_id] || t.unnamed) })
      events.sort((x, y) => new Date(y.at) - new Date(x.at))
      setActivity(events.slice(0, 6))
    } else {
      setStats({}); setTotMezzi(0); setTotCapienza(0); setTotUsedFlotta(0); setActivity([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('home-bus-' + turno.id)
    for (const table of ['bus_transfer', 'bus_gruppi', 'bus_assegnazioni', 'bus_mezzi', 'bus_staff', 'bus_roster']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno.id])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [lang])

  async function create() {
    const n = nome.trim()
    if (!n) return
    const { data, error } = await supabase.from('bus_transfer').insert({ nome: n, turno_id: turno.id }).select().single()
    if (!error && data) navigate(transferPath(data.id))
  }

  async function remove(t2) {
    if (!confirm(t.deleteTransferConfirm(t2.nome))) return
    await supabase.from('bus_transfer').delete().eq('id', t2.id)
    load()
  }

  const totPaxGestiti = totRosterPax > 0 ? totRosterPax : Object.values(stats).reduce((s, v) => s + v.tot, 0)
  const linkAttivi = transfers.filter(t2 => t2.condiviso).length
  const liberiFlotta = totCapienza - totUsedFlotta
  const pctFlotta = totCapienza ? (totUsedFlotta / totCapienza) * 100 : 0

  return (
    <div className="shell" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="board-strip" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {!agency && (
            <button onClick={() => navigate('/')} aria-label={t.backToTurni} style={{ display: 'flex' }}>
              <ChevronLeft size={16} />
            </button>
          )}
          <img src="/logo-header.png" alt="" width="26" height="26" style={{ display: 'block', flexShrink: 0 }} /> {t.appName} · {turno.codice}
        </span>
        <span className="sub">
          <LiveDot /> {t.manifestCount(transfers.length)}
          {!agency && (
            <button className="lang-toggle no-print" onClick={() => navigate('/turno/' + turno.codice + '/roster')} aria-label={t.rosterTitle} style={{ marginLeft: 2 }}>
              <ClipboardList size={12} style={{ verticalAlign: -2 }} /> {t.rosterBackHome}
            </button>
          )}
          <button className="lang-toggle no-print" onClick={() => setShowHelp(true)} aria-label={t.helpBtn}>
            <HelpCircle size={12} style={{ verticalAlign: -2 }} /> {t.helpBtn}
          </button>
          <button className="lang-toggle no-print" onClick={toggleLang} aria-label="Cambia lingua / Change language">
            {lang === 'it' ? 'EN' : 'IT'}
          </button>
        </span>
      </div>

      {showHelp && (
        <HelpModal title={t.helpTitle} closeLabel={t.helpClose}
          steps={agency ? t.helpStepsAgency : t.helpStepsStaff}
          onClose={() => setShowHelp(false)} />
      )}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div className="enter">
          <div style={{ fontSize: 21, fontWeight: 800 }}>{saluto()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)', marginTop: 2 }}>
            {new Date().toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {transfers.length > 0 && (
          <div className="stats-grid">
            <StatCard icon={Bus} label={t.statTransfer} value={transfers.length} tone="blue" style={{ '--d': '20ms' }} />
            <StatCard icon={Users} label={t.statPax} value={totPaxGestiti} tone="go" style={{ '--d': '50ms' }} />
            <StatCard icon={Bus} label={t.statBus} value={totMezzi} tone="signal" style={{ '--d': '80ms' }} />
            <StatCard icon={Share2} label={t.statLink} value={linkAttivi} tone="warn" style={{ '--d': '110ms' }} />
          </div>
        )}

        {creating ? (
          <div className="card enter" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="input-label" htmlFor="nn">{t.nameLabel}</label>
            <input id="nn" className="input-field" placeholder={t.namePlaceholder} value={nome}
              onChange={e => setNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={create}>{t.createBtn}</button>
              <button className="btn btn-ghost" onClick={() => { setCreating(false); setNome('') }}>{t.cancelBtn}</button>
            </div>
          </div>
        ) : (
          <button className="hero-banner enter" onClick={() => setCreating(true)} style={{ '--d': '140ms' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.14em', color: 'var(--signal)', fontWeight: 800, marginBottom: 6 }}>
                {t.newEyebrow}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{t.newTitle}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)' }}>{t.newSubtitle}</div>
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
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{t.emptyTitle}</div>
            <div style={{ fontSize: 14 }}>{t.emptyText}</div>
          </div>
        )}

        {transfers.length > 0 && (
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>{t.transfersSection}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {transfers.map((t2, i) => {
          const s = stats[t2.id] || { tot: 0, ass: 0 }
          const pct = s.tot ? Math.min(100, (s.ass / s.tot) * 100) : 0
          const st2 = statusOf(s)
          return (
            <div key={t2.id} className="stub enter" style={{ '--d': (220 + i * 45) + 'ms' }}>
              <button onClick={() => navigate(transferPath(t2.id))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left' }}>
                <div className={'stub-tag' + (st2.tag ? ' ' + st2.tag : '')}>
                  <span className="lbl">{st2.label.toUpperCase()}</span>
                  <span className="num tab-num">{s.tot ? Math.round(pct) + '%' : '—'}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t2.nome}</span>
                    <span className={'pill ' + st2.tone} style={{ flexShrink: 0 }}>{st2.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                    {fmtData(t2.created_at)} · {s.tot === 0 ? t.noGroups : <><CountNum value={s.ass} />/{s.tot} {t.paxUnit || 'pax'}</>}
                  </div>
                  {s.tot > 0 && <Gauge pct={pct} tone={s.ass >= s.tot ? 'full' : ''} style={{ marginTop: 8 }} />}
                </div>
                <ChevronRight size={18} color="var(--text-tertiary)" style={{ marginRight: 14, flexShrink: 0 }} />
              </button>
              <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => remove(t2)} aria-label={t.deleteBtn + ' ' + t2.nome}
                  style={{ color: 'var(--stop)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: 7 }}>
                  <Trash2 size={14} /> {t.deleteBtn}
                </button>
              </div>
            </div>
          )
        })}
        </div>

        {(totMezzi > 0 || activity.length > 0) && (
          <div className="dash-row" style={{ marginTop: 4 }}>
            {totMezzi > 0 && (
              <div className="card enter" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, '--d': '60ms' }}>
                <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
                  <FleetDonut pct={pctFlotta} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="tab-num" style={{ fontSize: 21, fontWeight: 800, color: liberiFlotta < 0 ? 'var(--stop)' : 'var(--text-primary)' }}>
                      <CountNum value={liberiFlotta} />
                    </span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{t.fleetFree}</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{t.fleetTitle}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {t.fleetDesc(totUsedFlotta, totCapienza, totMezzi, transfers.length)}
                  </div>
                </div>
              </div>
            )}

            {activity.length > 0 && (
              <div className="card enter" style={{ '--d': '90ms' }}>
                <div style={{ padding: '13px 16px 10px', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Activity size={15} /> {t.activityTitle}
                </div>
                {activity.map((ev, i) => {
                  const Icon = ev.icon
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px', borderTop: '1px solid var(--line)' }}>
                      <div className={'pill pill-' + ev.tone} style={{ width: 26, height: 26, borderRadius: 'var(--r-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
                        <Icon size={13} />
                      </div>
                      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>{ev.text}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--mono)', flexShrink: 0, whiteSpace: 'nowrap', marginTop: 2 }}>{timeAgo(ev.at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!agency && (
          <button className="no-print" onClick={() => navigate('/turno/' + turno.codice + '/roster')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 0 6px', color: 'var(--text-tertiary)', fontSize: 12.5 }}>
            <ClipboardList size={12} /> {t.rosterBackHome}
          </button>
        )}
      </div>
    </div>
  )
}
