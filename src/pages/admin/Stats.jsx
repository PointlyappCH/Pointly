import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, eachDayOfInterval, eachMonthOfInterval,
  addDays, subDays, addWeeks, subWeeks,
  addMonths, subMonths, addYears, subYears, isSameDay, isSameMonth,
  isToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

/* Palette stable : chaque employé / secteur garde sa couleur d'une vue à l'autre */
const PALETTE = [
  '#185FA5','#1D9E75','#EF9F27','#8B5CF6','#E24B4A',
  '#0A5E45','#B75CE0','#3E7CB1','#C4562E','#5B7C99',
]
function colorOf(name, index) {
  return PALETTE[index % PALETTE.length]
}

function fmtH(h) {
  if (!h && h !== 0) return '0h00'
  const ih = Math.floor(h)
  const im = Math.round((h - ih) * 60)
  return `${ih}h${String(im).padStart(2, '0')}`
}

const PERIODS = [
  { k: 'day',   label: 'Jour' },
  { k: 'week',  label: 'Semaine' },
  { k: 'month', label: 'Mois' },
  { k: 'year',  label: 'Année' },
]

export default function AdminStats() {
  const { company } = useAuth()

  const [period, setPeriod] = useState('week')
  const [cursor, setCursor] = useState(new Date())
  const [splitBy, setSplitBy] = useState('employee')  // 'employee' | 'sector'

  const [emps, setEmps] = useState([])
  const [logs, setLogs] = useState([])
  const [segs, setSegs] = useState([])
  const [loading, setLoading] = useState(true)

  /* ── Bornes de la période ── */
  const { start, end } = useMemo(() => {
    switch (period) {
      case 'day':   return { start: cursor, end: cursor }
      case 'week':  return { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) }
      case 'month': return { start: startOfMonth(cursor), end: endOfMonth(cursor) }
      default:      return { start: startOfYear(cursor), end: endOfYear(cursor) }
    }
  }, [period, cursor])

  const periodLabel = useMemo(() => {
    switch (period) {
      case 'day':   return isToday(cursor) ? "Aujourd'hui" : format(cursor, 'EEEE d MMMM', { locale: fr })
      case 'week':  return `${format(start, 'd MMM', { locale: fr })} — ${format(end, 'd MMM yyyy', { locale: fr })}`
      case 'month': return format(cursor, 'MMMM yyyy', { locale: fr })
      default:      return format(cursor, 'yyyy')
    }
  }, [period, cursor, start, end])

  function shift(dir) {
    setCursor(c => {
      if (period === 'day')   return dir > 0 ? addDays(c, 1)   : subDays(c, 1)
      if (period === 'week')  return dir > 0 ? addWeeks(c, 1)  : subWeeks(c, 1)
      if (period === 'month') return dir > 0 ? addMonths(c, 1) : subMonths(c, 1)
      return dir > 0 ? addYears(c, 1) : subYears(c, 1)
    })
  }

  /* ── Chargement ── */
  async function load() {
    if (!company) return
    setLoading(true)
    const sKey = format(start, 'yyyy-MM-dd')
    const eKey = format(end, 'yyyy-MM-dd')

    const [{ data: e }, { data: l }] = await Promise.all([
      supabase.from('profiles').select('*')
        .eq('company_id', company.id).order('full_name'),
      supabase.from('time_logs')
        .select('*, profiles!time_logs_user_id_fkey(full_name)')
        .eq('company_id', company.id)
        .gte('log_date', sKey).lte('log_date', eKey),
    ])
    setEmps(e || [])
    setLogs(l || [])

    if (company.sectors_enabled) {
      const { data: sg } = await supabase.from('shift_segments')
        .select('*')
        .eq('company_id', company.id)
        .gte('started_at', start.toISOString())
        .lt('started_at', new Date(end.getTime() + 86400000).toISOString())
      setSegs(sg || [])
    } else {
      setSegs([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [company, period, cursor])

  /* ── Séries : une "tranche" de temps par barre ── */
  const buckets = useMemo(() => {
    if (period === 'day') {
      return Array.from({ length: 24 }, (_, h) => ({
        key: String(h),
        label: `${String(h).padStart(2, '0')}h`,
        test: d => d.getHours() === h,
      }))
    }
    if (period === 'week' || period === 'month') {
      return eachDayOfInterval({ start, end }).map(d => ({
        key: format(d, 'yyyy-MM-dd'),
        label: period === 'week' ? format(d, 'EEE', { locale: fr }) : format(d, 'd'),
        test: x => isSameDay(x, d),
      }))
    }
    return eachMonthOfInterval({ start, end }).map(m => ({
      key: format(m, 'yyyy-MM'),
      label: format(m, 'MMM', { locale: fr }),
      test: x => isSameMonth(x, m),
    }))
  }, [period, start, end])

  /* Clés de découpage : employés ou secteurs */
  const series = useMemo(() => {
    if (splitBy === 'sector') {
      const names = [...new Set(segs.filter(s => s.ended_at).map(s => s.sector))].sort()
      return names.map((n, i) => ({ id: n, name: n, color: colorOf(n, i) }))
    }
    const ids = [...new Set(logs.map(l => l.user_id))]
    return ids.map((id, i) => {
      const emp = emps.find(e => e.id === id)
      const log = logs.find(l => l.user_id === id)
      return {
        id,
        name: emp?.full_name || log?.profiles?.full_name || 'Inconnu',
        color: colorOf(id, i),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [splitBy, logs, segs, emps])

  /* Données du graphique empilé */
  const chartData = useMemo(() => {
    return buckets.map(b => {
      const row = { label: b.label }
      series.forEach(s => { row[s.name] = 0 })

      if (splitBy === 'sector') {
        segs.filter(s => s.ended_at).forEach(s => {
          const st = new Date(s.started_at)
          if (!b.test(st)) return
          const h = (new Date(s.ended_at) - st) / 3600000
          row[s.sector] = +( (row[s.sector] || 0) + h ).toFixed(2)
        })
      } else {
        logs.forEach(l => {
          if (!l.punched_in) return
          const st = new Date(l.punched_in)
          if (!b.test(st)) return
          const name = emps.find(e => e.id === l.user_id)?.full_name
            || l.profiles?.full_name || 'Inconnu'
          const h = l.net_hours != null
            ? l.net_hours
            : (l.punched_out ? (new Date(l.punched_out) - st) / 3600000 : 0)
          row[name] = +( (row[name] || 0) + h ).toFixed(2)
        })
      }
      return row
    })
  }, [buckets, series, splitBy, logs, segs, emps])

  /* ── Totaux ── */
  const totals = useMemo(() => {
    const map = {}
    series.forEach(s => { map[s.name] = 0 })
    chartData.forEach(row => {
      series.forEach(s => { map[s.name] += row[s.name] || 0 })
    })
    return Object.entries(map)
      .map(([name, hours]) => ({ name, hours }))
      .filter(x => x.hours > 0)
      .sort((a, b) => b.hours - a.hours)
  }, [chartData, series])

  const grandTotal = totals.reduce((a, t) => a + t.hours, 0)
  const activeCount = new Set(logs.filter(l => l.punched_in).map(l => l.user_id)).size
  const hasData = grandTotal > 0

  /* Jour le plus chargé — utile pour repérer les pics */
  const busiest = useMemo(() => {
    let best = null
    chartData.forEach((row, i) => {
      const sum = series.reduce((a, s) => a + (row[s.name] || 0), 0)
      if (sum > 0 && (!best || sum > best.sum)) best = { label: buckets[i]?.label, sum }
    })
    return best
  }, [chartData, series, buckets])

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{ textDecoration: 'none', color: 'var(--text2)' }}>
          <i className="ti ti-arrow-left" style={{ fontSize: '22px' }} />
        </Link>
        <h1>Statistiques</h1>
      </div>

      <div className="content">

        {/* Période */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <span key={p.k}
              className={`chip ${period === p.k ? 'c-on' : 'c-off'}`}
              onClick={() => setPeriod(p.k)}>
              {p.label}
            </span>
          ))}
        </div>

        {/* Navigation */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
          <i className="ti ti-chevron-left"
            style={{ fontSize: '20px', cursor: 'pointer', color: 'var(--text2)' }}
            onClick={() => shift(-1)} />
          <span style={{ fontSize: '14px', fontWeight: '700', textAlign: 'center' }}>{periodLabel}</span>
          <i className="ti ti-chevron-right"
            style={{ fontSize: '20px', cursor: 'pointer', color: 'var(--text2)' }}
            onClick={() => shift(1)} />
        </div>

        {/* Chiffres clés */}
        <div className="sg">
          <div className="sc">
            <div className="sv" style={{ fontFamily: 'var(--mono)' }}>{fmtH(grandTotal)}</div>
            <div className="sl">Heures travaillées</div>
          </div>
          <div className="sc">
            <div className="sv" style={{ fontFamily: 'var(--mono)' }}>{activeCount}</div>
            <div className="sl">{activeCount > 1 ? 'Personnes actives' : 'Personne active'}</div>
          </div>
        </div>

        {/* Graphique principal */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div className="card-title" style={{ margin: 0 }}>Répartition dans le temps</div>
            {company?.sectors_enabled && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <span className={`chip ${splitBy === 'employee' ? 'c-on' : 'c-off'}`}
                  style={{ fontSize: '12px' }}
                  onClick={() => setSplitBy('employee')}>Par personne</span>
                <span className={`chip ${splitBy === 'sector' ? 'c-on' : 'c-off'}`}
                  style={{ fontSize: '12px' }}
                  onClick={() => setSplitBy('sector')}>Par secteur</span>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--text3)', padding: '30px 0', textAlign: 'center' }}>
              Chargement…
            </div>
          ) : !hasData ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <i className="ti ti-chart-bar-off" style={{ fontSize: '30px', color: 'var(--text3)', display: 'block', marginBottom: '8px' }} />
              <div style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: '600' }}>Aucune heure sur cette période</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                Seules les journées terminées sont comptées.
              </div>
            </div>
          ) : (
            <>
              <div style={{ width: '100%', height: period === 'day' ? 240 : 260 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ left: -18, right: 6, top: 4, bottom: 0 }} barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38}
                      tickFormatter={v => v === 0 ? '0' : `${v}h`} />
                    <Tooltip
                      formatter={(v, n) => [fmtH(v), n]}
                      contentStyle={{ fontSize: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}
                    />
                    {series.map(s => (
                      <Bar key={s.id} dataKey={s.name} stackId="a" fill={s.color} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Légende + totaux, fusionnés : la couleur fait le lien avec le graphique */}
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {totals.map(t => {
                  const s = series.find(x => x.name === t.name)
                  const pct = grandTotal > 0 ? Math.round(t.hours / grandTotal * 100) : 0
                  return (
                    <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: s?.color || '#999', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', flex: 1 }}>{t.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text3)', width: '34px', textAlign: 'right' }}>{pct}%</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'var(--mono)', width: '52px', textAlign: 'right' }}>
                        {fmtH(t.hours)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Lecture rapide */}
        {hasData && busiest && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '13px 15px' }}>
            <i className="ti ti-flame" style={{ fontSize: '20px', color: 'var(--orange)', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.45' }}>
              Pic d'activité : <strong style={{ color: 'var(--text)' }}>{busiest.label}</strong>
              {' · '}<strong style={{ color: 'var(--text)' }}>{fmtH(busiest.sum)}</strong>
              {activeCount > 0 && <> · moyenne <strong style={{ color: 'var(--text)' }}>{fmtH(grandTotal / activeCount)}</strong> par personne</>}
            </div>
          </div>
        )}

      </div>

      <div className="nav">
        <Link to="/admin" style={{ textDecoration: 'none', flex: 1 }}>
          <div className="nav-item"><i className="ti ti-layout-dashboard" />Accueil</div>
        </Link>
        <Link to="/admin/planning" style={{ textDecoration: 'none', flex: 1 }}>
          <div className="nav-item"><i className="ti ti-calendar" />Planning</div>
        </Link>
        <Link to="/admin/team" style={{ textDecoration: 'none', flex: 1 }}>
          <div className="nav-item"><i className="ti ti-users" />Équipe</div>
        </Link>
        <Link to="/admin/chat" style={{ textDecoration: 'none', flex: 1 }}>
          <div className="nav-item"><i className="ti ti-message-2" />Chat</div>
        </Link>
        <Link to="/admin/profile" style={{ textDecoration: 'none', flex: 1 }}>
          <div className="nav-item"><i className="ti ti-user-circle" />Profil</div>
        </Link>
      </div>
    </div>
  )
}
