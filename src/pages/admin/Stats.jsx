import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachMonthOfInterval, isSameMonth
} from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts'

const PALETTE = ['#185FA5','#0A5E45','#7A4500','#534AB7','#8B1F1F','#1D9E75','#E24B4A','#EF9F27','#3E7CB1','#B75CE0']

function fmtH(h){ if(!h&&h!==0) return '0h00'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }

export default function AdminStats() {
  const { company } = useAuth()
  const [period, setPeriod] = useState('month') // 'day' | 'month'
  const [cursor, setCursor] = useState(new Date())
  const [emps, setEmps]     = useState([])
  const [logs, setLogs]     = useState([])
  const [loading, setLoading] = useState(false)

  // Comparaison secteurs
  const [compareSector, setCompareSector] = useState('all')
  const [yearA, setYearA] = useState(new Date().getFullYear())
  const [yearB, setYearB] = useState(new Date().getFullYear()-1)
  const [segmentsYearA, setSegmentsYearA] = useState([])
  const [segmentsYearB, setSegmentsYearB] = useState([])
  const [sectorList, setSectorList] = useState([])
  const [periodSegments, setPeriodSegments] = useState([])

  const dateKey = format(cursor,'yyyy-MM-dd')
  const rangeStart = period==='day' ? cursor : startOfMonth(cursor)
  const rangeEnd   = period==='day' ? cursor : endOfMonth(cursor)
  const rangeStartKey = format(rangeStart,'yyyy-MM-dd')
  const rangeEndKey   = format(rangeEnd,'yyyy-MM-dd')

  async function loadData() {
    if (!company) return
    setLoading(true)
    const [{ data: e }, { data: l }] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', company.id).eq('role','employee').order('full_name'),
      supabase.from('time_logs').select('*, profiles!time_logs_user_id_fkey(full_name,color_bg,color_fg)')
        .eq('company_id', company.id)
        .gte('log_date', rangeStartKey).lte('log_date', rangeEndKey),
    ])
    setEmps(e||[]); setLogs(l||[])

    if (company.sectors_enabled) {
      const { data: segs } = await supabase.from('shift_segments')
        .select('*').eq('company_id', company.id)
        .gte('started_at', rangeStart.toISOString())
        .lt('started_at', new Date(rangeEnd.getTime()+86400000).toISOString())
      setPeriodSegments(segs||[])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [company, period, dateKey])

  // Charge la liste des secteurs connus (pour le sélecteur de comparaison)
  useEffect(() => {
    if (!company?.sectors_enabled) return
    supabase.from('shift_segments').select('sector').eq('company_id', company.id)
      .then(({ data }) => {
        const uniq = [...new Set((data||[]).map(s=>s.sector))].sort()
        setSectorList(uniq)
      })
  }, [company])

  // Charge les données annuelles pour comparaison
  async function loadYearData(year, setter) {
    if (!company?.sectors_enabled) return
    const start = startOfYear(new Date(year,0,1))
    const end   = endOfYear(new Date(year,0,1))
    const { data } = await supabase.from('shift_segments')
      .select('*').eq('company_id', company.id)
      .gte('started_at', start.toISOString())
      .lt('started_at', new Date(end.getTime()+86400000).toISOString())
    setter(data||[])
  }
  useEffect(() => { loadYearData(yearA, setSegmentsYearA) }, [company, yearA])
  useEffect(() => { loadYearData(yearB, setSegmentsYearB) }, [company, yearB])

  // ── Agrégations ──
  const byEmployee = useMemo(() => {
    const map = {}
    logs.forEach(l => {
      if (!l.net_hours) return
      const name = l.profiles?.full_name || 'Inconnu'
      map[name] = (map[name]||0) + l.net_hours
    })
    return Object.entries(map).map(([name,hours])=>({ name, hours: +hours.toFixed(2) }))
      .sort((a,b)=>b.hours-a.hours)
  }, [logs])

  const totalHours = byEmployee.reduce((a,e)=>a+e.hours,0)
  const presentCount = new Set(logs.filter(l=>l.punched_in).map(l=>l.user_id)).size
  const avgPerEmp = presentCount ? totalHours/presentCount : 0

  const sectorPie = useMemo(() => {
    const map = {}
    periodSegments.forEach(s => {
      if (!s.ended_at) return
      const h = (new Date(s.ended_at)-new Date(s.started_at))/3600000
      map[s.sector] = (map[s.sector]||0) + h
    })
    return Object.entries(map).map(([name,value])=>({ name, value: +value.toFixed(2) }))
      .sort((a,b)=>b.value-a.value)
  }, [periodSegments])

  const dataA = useMemo(() => {
    const allMonths = eachMonthOfInterval({ start: new Date(yearA,0,1), end: new Date(yearA,11,1) })
    return allMonths.map(m => {
      const total = segmentsYearA
        .filter(s => s.ended_at && isSameMonth(new Date(s.started_at), m) && (compareSector==='all' || s.sector===compareSector))
        .reduce((a,s)=>a+(new Date(s.ended_at)-new Date(s.started_at))/3600000, 0)
      return { month: format(m,'MMM',{locale:fr}), [String(yearA)]: +total.toFixed(1) }
    })
  }, [segmentsYearA, yearA, compareSector])

  const dataB = useMemo(() => {
    const allMonths = eachMonthOfInterval({ start: new Date(yearB,0,1), end: new Date(yearB,11,1) })
    return allMonths.map(m => {
      const total = segmentsYearB
        .filter(s => s.ended_at && isSameMonth(new Date(s.started_at), m) && (compareSector==='all' || s.sector===compareSector))
        .reduce((a,s)=>a+(new Date(s.ended_at)-new Date(s.started_at))/3600000, 0)
      return { month: format(m,'MMM',{locale:fr}), [String(yearB)]: +total.toFixed(1) }
    })
  }, [segmentsYearB, yearB, compareSector])

  const compareData = useMemo(() => {
    return dataA.map((row,i) => ({ ...row, ...dataB[i] }))
  }, [dataA, dataB])

  const yearOptions = []
  const curYear = new Date().getFullYear()
  for (let y=curYear; y>=curYear-5; y--) yearOptions.push(y)

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Statistiques</h1>
      </div>

      <div className="content">
        {/* Toggle jour/mois */}
        <div style={{display:'flex',gap:'8px'}}>
          <span className={`chip ${period==='day'?'c-on':'c-off'}`} onClick={()=>setPeriod('day')}>Jour</span>
          <span className={`chip ${period==='month'?'c-on':'c-off'}`} onClick={()=>setPeriod('month')}>Mois</span>
        </div>

        {/* Navigation période */}
        <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px'}}>
          <i className="ti ti-chevron-left" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}}
            onClick={()=>setCursor(c=>{ const d=new Date(c); if(period==='day') d.setDate(d.getDate()-1); else d.setMonth(d.getMonth()-1); return d })}/>
          <span style={{fontSize:'14px',fontWeight:'700'}}>
            {period==='day' ? format(cursor,'EEEE d MMMM yyyy',{locale:fr}) : format(cursor,'MMMM yyyy',{locale:fr})}
          </span>
          <i className="ti ti-chevron-right" style={{fontSize:'20px',cursor:'pointer',color:'var(--text2)'}}
            onClick={()=>setCursor(c=>{ const d=new Date(c); if(period==='day') d.setDate(d.getDate()+1); else d.setMonth(d.getMonth()+1); return d })}/>
        </div>

        {/* KPIs */}
        <div className="sg">
          <div className="sc"><div className="sv">{fmtH(totalHours)}</div><div className="sl">Heures totales</div></div>
          <div className="sc"><div className="sv">{presentCount}</div><div className="sl">Employé{presentCount>1?'s':''} présent{presentCount>1?'s':''}</div></div>
        </div>
        <div className="sg">
          <div className="sc"><div className="sv">{fmtH(avgPerEmp)}</div><div className="sl">Moyenne / employé</div></div>
          <div className="sc"><div className="sv">{emps.length}</div><div className="sl">Équipe totale</div></div>
        </div>

        {/* Heures par employé */}
        <div className="card">
          <div className="card-title">Heures par employé</div>
          {byEmployee.length===0 ? (
            <div style={{fontSize:'13px',color:'var(--text3)',padding:'10px 0'}}>Aucune donnée pour cette période</div>
          ) : (
            <div style={{width:'100%',height:Math.max(180, byEmployee.length*40)}}>
              <ResponsiveContainer>
                <BarChart data={byEmployee} layout="vertical" margin={{left:10,right:20,top:5,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:11}}/>
                  <YAxis type="category" dataKey="name" width={90} tick={{fontSize:11}}/>
                  <Tooltip formatter={(v)=>fmtH(v)}/>
                  <Bar dataKey="hours" fill="#185FA5" radius={[0,4,4,0]}>
                    <LabelList dataKey="hours" position="right" formatter={fmtH} style={{fontSize:11,fill:'var(--text2)'}}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── SECTEURS (si activé) ── */}
        {company?.sectors_enabled && (
          <>
            <div className="card">
              <div className="card-title">Répartition par secteur — {period==='day'?format(cursor,'d MMM',{locale:fr}):format(cursor,'MMMM yyyy',{locale:fr})}</div>
              {sectorPie.length===0 ? (
                <div style={{fontSize:'13px',color:'var(--text3)',padding:'10px 0'}}>Aucun secteur enregistré pour cette période</div>
              ) : (
                <div style={{width:'100%',height:260}}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={sectorPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                        label={({name,value})=>`${name} · ${fmtH(value)}`}>
                        {sectorPie.map((entry,i)=><Cell key={entry.name} fill={PALETTE[i%PALETTE.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v)=>fmtH(v)}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">Comparaison annuelle par secteur</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'14px'}}>
                <div className="iw">
                  <div className="il">Secteur</div>
                  <select className="if" value={compareSector} onChange={e=>setCompareSector(e.target.value)} style={{cursor:'pointer'}}>
                    <option value="all">Tous secteurs confondus</option>
                    {sectorList.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  <div className="iw">
                    <div className="il">Année A</div>
                    <select className="if" value={yearA} onChange={e=>setYearA(Number(e.target.value))} style={{cursor:'pointer'}}>
                      {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="iw">
                    <div className="il">Année B</div>
                    <select className="if" value={yearB} onChange={e=>setYearB(Number(e.target.value))} style={{cursor:'pointer'}}>
                      {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{width:'100%',height:260}}>
                <ResponsiveContainer>
                  <BarChart data={compareData} margin={{left:0,right:10,top:5,bottom:5}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11}}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip formatter={(v)=>fmtH(v)}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Bar dataKey={String(yearA)} fill="#185FA5" radius={[3,3,0,0]}/>
                    <Bar dataKey={String(yearB)} fill="#EF9F27" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>
    </div>
  )
}
