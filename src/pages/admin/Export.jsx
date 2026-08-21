import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, getDate, differenceInCalendarMonths
} from 'date-fns'
import { fr } from 'date-fns/locale'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function getCyclePeriod(cycle, monthIdx, year) {
  const day = parseInt((cycle||'1-1').split('-')[0]) || 1
  if (day === 1) {
    const start = new Date(year, monthIdx, 1)
    const end   = endOfMonth(start)
    return { start, end, label: MONTHS[monthIdx]+' '+year }
  }
  const start = new Date(year, monthIdx-1, day)
  const end   = new Date(year, monthIdx, day-1)
  return { start, end, label: `${String(day).padStart(2,'0')}/${String(monthIdx).padStart(2,'0')} → ${String(day-1).padStart(2,'0')}/${String(monthIdx+1).padStart(2,'0')} ${year}` }
}

function safeDaysInterval(start, end) {
  try {
    if (!(start instanceof Date) || isNaN(start.getTime())) return []
    if (!(end instanceof Date) || isNaN(end.getTime())) return []
    if (start > end) return []
    return eachDayOfInterval({ start, end }) || []
  } catch {
    return []
  }
}

function fmtH(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }
function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }

export default function AdminExport() {
  const { profile, company } = useAuth()
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
  const [reportScope, setReportScope] = useState('month')
  const [reportSegs, setReportSegs] = useState([])
  const [emps, setEmps]         = useState([])
  const [allLogs, setAllLogs]   = useState([])
  const [generating, setGenerating] = useState(false)
  const [toast, setToast]       = useState('')

  const year = new Date().getFullYear()
  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(''),3000) }

  async function loadData() {
    if (!company) return
    const { start, end } = getCyclePeriod('1-1', selMonth, year)
    const fmt = d => format(d,'yyyy-MM-dd')

    const [{ data: e }, { data: l }] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', company.id).eq('role','employee').order('full_name'),
      supabase.from('time_logs').select('*, profiles!time_logs_user_id_fkey(full_name)')
        .eq('company_id', company.id)
        .gte('log_date', fmt(start)).lte('log_date', fmt(end)),
    ])
    setEmps(e||[])
    setAllLogs(l||[])
  }

  useEffect(() => { loadData() }, [company, selMonth])

  useEffect(() => {
    if (!company?.sectors_enabled) { setReportSegs([]); return }
    const from = reportScope === 'year'
      ? new Date(year, 0, 1)
      : new Date(year, selMonth, 1)
    const to = reportScope === 'year'
      ? new Date(year, 11, 31, 23, 59, 59)
      : new Date(year, selMonth + 1, 0, 23, 59, 59)
    supabase.from('shift_segments').select('*')
      .eq('company_id', company.id)
      .gte('started_at', from.toISOString())
      .lte('started_at', to.toISOString())
      .then(({ data }) => setReportSegs(data || []))
  }, [company, selMonth, year, reportScope])

  function reportSectorsFor(userId) {
    const map = {}
    reportSegs.filter(x => x.user_id === userId && x.ended_at).forEach(x => {
      const h = (new Date(x.ended_at) - new Date(x.started_at)) / 3600000
      map[x.sector] = (map[x.sector] || 0) + h
    })
    return Object.entries(map).map(([sector, hours]) => ({ sector, hours }))
      .sort((a, b) => b.hours - a.hours)
  }
  function reportTotals() {
    const map = {}
    reportSegs.filter(x => x.ended_at).forEach(x => {
      const h = (new Date(x.ended_at) - new Date(x.started_at)) / 3600000
      map[x.sector] = (map[x.sector] || 0) + h
    })
    return Object.entries(map).map(([sector, hours]) => ({ sector, hours }))
      .sort((a, b) => b.hours - a.hours)
  }

  // Calcule le solde d'heures cumulé d'un employé depuis sa date d'embauche
  // jusqu'à la fin de la période sélectionnée. Se reporte automatiquement
  // d'un mois sur l'autre — rien à stocker ni mettre à jour manuellement.
  async function computeCumulativeBalance(emp, periodEnd) {
    try {
      const anchor = emp.hire_date ? new Date(emp.hire_date) : periodEnd
      if (isNaN(anchor.getTime()) || anchor > periodEnd) {
        return { cumulativeSupp: 0, monthsElapsed: 0 }
      }
      const monthsElapsed = Math.max(1, differenceInCalendarMonths(periodEnd, anchor) + 1)
      const cumulativeDue = (emp.h_due || 169) * monthsElapsed

      const { data: cumLogs } = await supabase.from('time_logs')
        .select('net_hours')
        .eq('user_id', emp.id)
        .gte('log_date', format(anchor, 'yyyy-MM-dd'))
        .lte('log_date', format(periodEnd, 'yyyy-MM-dd'))

      const cumulativeWorked = (cumLogs || []).reduce((a, l) => a + (l.net_hours || 0), 0)
      return { cumulativeSupp: cumulativeWorked - cumulativeDue, monthsElapsed }
    } catch {
      return { cumulativeSupp: 0, monthsElapsed: 0 }
    }
  }

  async function generatePDF() {
    setGenerating(true)
    showToast('Chargement jsPDF…')

    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')
    }

    const skipped = []

    try {
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' })
      const W=297, lm=12, uw=W-lm*2
      const co = company?.name||'Mon entreprise'
      const monthLabel = MONTHS[selMonth]+' '+year
      const genDate = format(new Date(),'dd/MM/yyyy HH:mm')
      const DARK=[26,26,46], MID=[46,46,94], GREEN=[29,158,117]
      const GREEN_BG=[225,245,238], ORANGE_BG=[250,238,218]
      const RED=[226,75,74], RED_BG=[252,235,235]
      const BLUE=[24,95,165], BLUE_BG=[230,241,251]
      const GREY=[200,200,200], MODIF_BG=[255,240,208], MODIF_FG=[133,79,11]

      let pageAdded = false

      for (const emp of emps) {
        try {
          const period = getCyclePeriod(emp.cycle||'1-1', selMonth, year)
          const days   = safeDaysInterval(period.start, period.end)

          if (days.length === 0) {
            skipped.push(emp.full_name + ' (période invalide — vérifier son cycle de calcul)')
            continue
          }

          if (pageAdded) doc.addPage('a4','landscape')
          pageAdded = true

          const empLogs = allLogs.filter(l => l.user_id === emp.id)
          const logMap  = {}
          empLogs.forEach(l => { logMap[l.log_date] = l })

          doc.setFillColor(...DARK); doc.rect(lm,8,uw,10,'F')
          doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12)
          doc.text(`FEUILLE D'HEURES · ${co.toUpperCase()} · ${monthLabel.toUpperCase()}`, W/2, 14.5, {align:'center'})

          doc.setFillColor(244,244,250); doc.rect(lm,18,uw,7,'F')
          doc.setTextColor(136,136,136); doc.setFont('helvetica','normal'); doc.setFontSize(8)
          doc.text(`Période du ${format(period.start,'dd/MM/yyyy')} au ${format(period.end,'dd/MM/yyyy')}  ·  Généré le ${genDate}`, W/2, 22.5, {align:'center'})

          doc.setFillColor(...BLUE_BG); doc.rect(lm,25,uw,14,'F')
          doc.setDrawColor(...BLUE); doc.rect(lm,25,uw,14,'S')
          const cw4=uw/4
          const inf1=[['Employé',emp.full_name],['Fonction',emp.poste||'—'],['Contrat',emp.contract==='heure'?'À l\'heure':'Fixe mensuel'],['Rapports de service',(emp.hire_date?format(new Date(emp.hire_date),'dd/MM/yyyy'):'—')+(emp.end_date?' au '+format(new Date(emp.end_date),'dd/MM/yyyy'):'')]]
          inf1.forEach(([lbl,val],i) => {
            const x=lm+i*cw4+3
            doc.setTextColor(...BLUE); doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.text(lbl,x,29)
            doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(val,x,34)
          })
          const inf2=[['H. dues/mois',fmtH(emp.h_due||169)],['Vacances droit',(emp.vac_droit||20)+' j'],['Vacances pris',(emp.vac_pris||0)+' j'],['Vacances rest.',((emp.vac_droit||20)-(emp.vac_pris||0))+' j']]
          inf2.forEach(([lbl,val],i) => {
            const x=lm+i*cw4+3
            doc.setTextColor(100,100,130); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.text(lbl,x,37.5)
            doc.setTextColor(...DARK); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(val,x,41)
          })

          const cw=[18,16,18,16,16,14,14,16,0]
          const totCW=cw.reduce((a,b)=>a+b,0); cw[8]=uw-totCW

          const rows=[]; let totalNet=0; let workedDays=0
          let weekNet=0; let weekLabel=null

          function pushWeekSubtotal() {
            if (weekLabel === null) return
            rows.push({
              v:['Semaine '+weekLabel,'','','','','',fmtH(weekNet),'','Total hebdomadaire'],
              sub:true
            })
          }

          days.forEach((day) => {
            const key = format(day,'yyyy-MM-dd')
            const log = logMap[key]
            const wk  = format(day,'II')

            if (weekLabel === null) weekLabel = wk
            else if (wk !== weekLabel) { pushWeekSubtotal(); weekNet=0; weekLabel=wk }

            const dayLabel = format(day,'dd/MM')+' '+format(day,'EEEEE',{locale:fr}).toUpperCase()
            const isSunday = day.getDay() === 0

            if (!log?.punched_in) {
              rows.push({
                v:[dayLabel,'—','—','—','—','—','—','','Repos'],
                rest:true, sunday:isSunday
              })
              return
            }

            workedDays++
            const nh = log.net_hours||0; totalNet+=nh; weekNet+=nh

            const pauseMin = (log.pause_start && log.pause_end)
              ? Math.round((new Date(log.pause_end)-new Date(log.pause_start))/60000)
              : 0

            const hIn  = new Date(log.punched_in).getHours()
            const hOut = log.punched_out ? new Date(log.punched_out).getHours() : hIn
            const isNight = hIn >= 23 || hIn < 6 || hOut >= 23 || hOut < 6

            const flags = []
            if (isSunday) flags.push('Dimanche')
            if (isNight)  flags.push('Nuit')
            const note = [flags.join(' + '), log.remark||''].filter(Boolean).join(' · ')

            rows.push({
              v:[dayLabel,fmtTime(log.punched_in),
                 pauseMin>0?fmtTime(log.pause_start):'—',
                 pauseMin>0?fmtTime(log.pause_end):'—',
                 log.punched_out?fmtTime(log.punched_out):'—',
                 pauseMin>0?`${pauseMin} min`:'—',
                 fmtH(nh), log.is_modified?'OUI':'Non', note],
              mod: log.is_modified, special: flags.length>0, sunday:isSunday
            })
          })
          pushWeekSubtotal()

          if (rows.length === 0) {
            rows.push({ v:['—','—','—','—','—','—','0h00','Non','Aucun pointage enregistré sur la période'], mod:false })
          }

          doc.autoTable({
            startY:43,
            head:[['DATE','ARRIVÉE','DÉB.PAUSE','FIN PAUSE','DÉPART','PAUSE','HEURES NET','MODIFIÉ','OBSERVATIONS']],
            body:rows.map(r=>r.v),
            columnStyles:Object.fromEntries(cw.map((w,i)=>([i,{cellWidth:w,halign:i===8?'left':'center'}]))),
            headStyles:{fillColor:MID,textColor:[255,255,255],fontStyle:'bold',fontSize:7.5,halign:'center',cellPadding:2.5},
            bodyStyles:{fontSize:7.5,cellPadding:2.5},
            alternateRowStyles:{fillColor:[248,248,252]},
            margin:{left:lm,right:lm},
            tableLineColor:GREY,tableLineWidth:0.3,
            didParseCell(data){
              if(data.section!=='body') return
              const r=rows[data.row.index]
              if(data.column.index===6){ data.cell.styles.textColor=GREEN; data.cell.styles.fontStyle='bold' }
              if(r?.rest){
                data.cell.styles.fillColor=[250,250,252]
                data.cell.styles.textColor=[170,170,180]
                if(data.column.index===6) data.cell.styles.textColor=[170,170,180]
              }
              if(r?.sunday){ data.cell.styles.fontStyle='bold' }
              if(r?.special){ data.cell.styles.fillColor=BLUE_BG }
              if(r?.mod){ data.cell.styles.fillColor=MODIF_BG; if(data.column.index===7)data.cell.styles.textColor=MODIF_FG }
              if(r?.sub){
                data.cell.styles.fillColor=[236,236,244]
                data.cell.styles.fontStyle='bold'
                data.cell.styles.textColor=DARK
                if(data.column.index===6) data.cell.styles.textColor=DARK
              }
            }
          })

          const aty = doc.lastAutoTable.finalY+4
          const isHourly = emp.contract==='heure'
          const hDue=emp.h_due||169; const hSupp=totalNet-hDue
          const sBg=hSupp>=0?GREEN_BG:RED_BG; const sFg=hSupp>=0?GREEN:RED

          const { cumulativeSupp, monthsElapsed } = await computeCumulativeBalance(emp, period.end)
          const cumBg = cumulativeSupp>=0?GREEN_BG:RED_BG; const cumFg = cumulativeSupp>=0?GREEN:RED

          const cw6=uw/6
          const ri = isHourly ? [
            {l:'TOTAL TRAVAILLÉ',v:fmtH(totalNet),bg:GREEN_BG,fg:GREEN},
            {l:'JOURS TRAVAILLÉS',v:workedDays+' j',bg:[245,245,250],fg:DARK},
            {l:'MOYENNE / JOUR',v:workedDays?fmtH(totalNet/workedDays):'—',bg:BLUE_BG,fg:BLUE},
            {l:'CONTRAT',v:'À l\'heure',bg:[245,245,250],fg:DARK},
            {l:'VAC. RESTANTES',v:((emp.vac_droit||20)-(emp.vac_pris||0))+' j',bg:ORANGE_BG,fg:[239,159,39]},
            {l:'À FACTURER',v:fmtH(totalNet),bg:GREEN_BG,fg:GREEN},
          ] : [
            {l:'TOTAL TRAVAILLÉ',v:fmtH(totalNet),bg:GREEN_BG,fg:GREEN},
            {l:'HEURES DUES',v:fmtH(hDue),bg:BLUE_BG,fg:BLUE},
            {l:'H. SUPP. (mois)',v:(hSupp>=0?'+':'-')+fmtH(Math.abs(hSupp)),bg:sBg,fg:sFg},
            {l:'VAC. RESTANTES',v:((emp.vac_droit||20)-(emp.vac_pris||0))+' j',bg:ORANGE_BG,fg:[239,159,39]},
            {l:'JOURS TRAVAILLÉS',v:workedDays+' j',bg:[245,245,250],fg:DARK},
            {l:`SOLDE CUMULÉ (${monthsElapsed} mois)`,v:(cumulativeSupp>=0?'+':'-')+fmtH(Math.abs(cumulativeSupp)),bg:cumBg,fg:cumFg},
          ]
          ri.forEach((item,i) => {
            const rx=lm+i*cw6
            doc.setFillColor(...item.bg); doc.rect(rx,aty,cw6,12,'F')
            doc.setDrawColor(...GREY); doc.rect(rx,aty,cw6,12,'S')
            doc.setTextColor(120,120,130); doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.text(item.l,rx+cw6/2,aty+4,{align:'center'})
            doc.setTextColor(...item.fg); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(item.v,rx+cw6/2,aty+10,{align:'center'})
          })

          let secY = aty + 16

          const sy=secY
          doc.setFillColor(248,248,252); doc.rect(lm,sy,uw,14,'F')
          doc.setDrawColor(...GREY); doc.rect(lm,sy,uw,14,'S')
          const cw3=uw/3
          ;[["Signature de l'employé","________________________"],["Signature de l'employeur","________________________"],["Date de validation","________________________"]].forEach((sig,i) => {
            const sx=lm+i*cw3+cw3/2
            doc.setTextColor(150,150,150); doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.text(sig[0],sx,sy+5,{align:'center'})
            doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(sig[1],sx,sy+11,{align:'center'})
          })

          doc.setTextColor(150,150,150); doc.setFont('helvetica','normal'); doc.setFontSize(6)
          doc.text("Relevé établi conformément aux art. 46 LTr et 73 OLT 1. À conserver 5 ans. Les pauses de moins de 30 minutes ne sont pas mentionnées. Le solde cumulé reporte les heures supplémentaires ou manquantes depuis la date d'embauche.", W/2, 202.5, {align:'center'})
          doc.setTextColor(180,180,180); doc.setFont('helvetica','italic'); doc.setFontSize(6.5)
          doc.text(`Pointly · ${co} · ${monthLabel}`, W/2, 206, {align:'center'})

          doc.saveGraphicsState(); doc.setGState(new doc.GState({opacity:0.03}))
          doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(55)
          doc.text('OFFICIEL', W/2, 105, {align:'center',angle:35})
          doc.restoreGraphicsState()
        } catch (empErr) {
          skipped.push(emp.full_name + ' (erreur : ' + empErr.message + ')')
        }
      }

      if (!pageAdded) {
        throw new Error("Aucune feuille n'a pu être générée — vérifiez le cycle de calcul de vos employés.")
      }

      doc.addPage('a4','landscape')
      doc.setFillColor(...DARK); doc.rect(lm,8,uw,10,'F')
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12)
      doc.text(`RÉCAPITULATIF ÉQUIPE · ${co.toUpperCase()} · ${monthLabel.toUpperCase()}`, W/2, 14.5, {align:'center'})

      const recapRows = emps.map(emp => {
        const empLogs = allLogs.filter(l=>l.user_id===emp.id)
        const total = empLogs.reduce((a,l)=>a+(l.net_hours||0), 0)
        const hDue = emp.h_due||169
        return [emp.full_name, mkIni(emp.full_name), emp.poste||'—',
          emp.contract==='heure'?'À l\'heure':'Fixe',
          fmtH(total), fmtH(hDue),
          (total-hDue>=0?'+':'')+fmtH(Math.abs(total-hDue)),
          (emp.vac_droit||20)+' j', (emp.vac_pris||0)+' j',
          ((emp.vac_droit||20)-(emp.vac_pris||0))+' j']
      })

      doc.autoTable({
        startY:22,
        head:[['EMPLOYÉ','INI.','POSTE','CONTRAT','H. TRAVAILLÉES','H. DUES','H. SUPP.','VAC. DROIT','VAC. PRIS','VAC. REST.']],
        body:recapRows,
        headStyles:{fillColor:MID,textColor:[255,255,255],fontStyle:'bold',fontSize:8.5,halign:'center'},
        bodyStyles:{fontSize:8.5,cellPadding:4},
        alternateRowStyles:{fillColor:[248,248,252]},
        margin:{left:lm,right:lm},
      })

      doc.setTextColor(180,180,180); doc.setFont('helvetica','italic'); doc.setFontSize(6.5)
      doc.text(`Pointly · ${co} · ${monthLabel} · Relevé généré automatiquement`, W/2, 206, {align:'center'})

      doc.save(`Feuille-heures_${co.replace(/ /g,'_')}_${monthLabel.replace(/ /g,'_')}.pdf`)

      if (skipped.length > 0) {
        showToast('PDF généré, mais ignoré : ' + skipped.join(' · '))
      } else {
        showToast('Feuille d\'heures téléchargée')
      }
    } catch(err) {
      showToast('Erreur PDF : '+err.message)
      console.error(err)
    }
    setGenerating(false)
  }

  function loadScript(src) {
    return new Promise((res,rej) => {
      const s=document.createElement('script'); s.src=src
      s.onload=res; s.onerror=rej; document.head.appendChild(s)
    })
  }

  function mkIni(name=''){ const p=name.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  const summaries = emps.map(emp => {
    const total = allLogs.filter(l=>l.user_id===emp.id).reduce((a,l)=>a+(l.net_hours||0),0)
    const hDue  = emp.h_due||169
    return { ...emp, total, hDue, supp: total-hDue }
  })

  return (
    <div className="screen">
      <div className="topbar">
        <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
        <h1>Export mensuel</h1>
      </div>

      <div className="content">
        <div className="card">
          <div className="card-title">Mois à exporter</div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
            {MONTHS.map((m,i) => (
              <div key={i} onClick={()=>setSelMonth(i)}
                style={{padding:'6px 12px',borderRadius:'20px',fontSize:'13px',fontWeight:'700',cursor:'pointer',
                  border:`1.5px solid ${selMonth===i?'var(--accent)':'var(--border)'}`,
                  background:selMonth===i?'var(--blue-bg)':'transparent',
                  color:selMonth===i?'var(--accent)':'var(--text2)'}}>
                {m}
              </div>
            ))}
          </div>
        </div>

        {summaries.length > 0 && (
          <div className="card">
            <div className="card-title">Aperçu — {MONTHS[selMonth]} {year}</div>
            {summaries.map(emp => (
              <div key={emp.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="av" style={{width:'34px',height:'34px',fontSize:'11px',background:emp.color_bg||'#E6F1FB',color:emp.color_fg||'#185FA5'}}>{mkIni(emp.full_name)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:'700'}}>{emp.full_name}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{emp.poste}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'15px',fontWeight:'800'}}>{fmtH(emp.total)}</div>
                  <div style={{fontSize:'11px',fontWeight:'700',color:emp.supp>=0?'var(--green)':'var(--red)'}}>
                    {emp.supp>=0?'+':''}{fmtH(Math.abs(emp.supp))} supp.
                  </div>
                </div>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginTop:'4px'}}>
              <span style={{fontSize:'14px',color:'var(--text2)'}}>Total équipe</span>
              <span style={{fontSize:'18px',fontWeight:'800'}}>{fmtH(summaries.reduce((a,e)=>a+e.total,0))}</span>
            </div>
          </div>
        )}

        {emps.length===0 && (
          <div className="card" style={{textAlign:'center',padding:'24px'}}>
            <div style={{fontSize:'14px',color:'var(--text2)'}}>Aucun employé — <Link to="/admin/team" style={{color:'var(--accent)'}}>ajoutez votre équipe →</Link></div>
          </div>
        )}

        <div className="card" style={{borderLeft:'3px solid var(--accent)'}}>
          <div className="card-title">Feuille d'heures</div>
          <div style={{fontSize:'12px',color:'var(--text2)',lineHeight:'1.55',marginBottom:'12px'}}>
            Une page par employé : horaires, pauses, jours de repos, totaux hebdomadaires et
            <strong> solde cumulé depuis l'embauche</strong> (report automatique des heures supp.
            d'un mois à l'autre). Établie selon les art. 46 LTr et 73 OLT 1.
          </div>
          <button className="btn btn-p" onClick={generatePDF} disabled={generating||emps.length===0}>
            {generating
              ? <><div className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px',borderColor:'rgba(255,255,255,.3)',borderTopColor:'#fff'}}/> Génération…</>
              : <><i className="ti ti-file-description"/>Feuille d'heures — {MONTHS[selMonth]}</>
            }
          </button>
          <button className="btn btn-s" style={{marginTop:'8px'}} onClick={exportCSV} disabled={emps.length===0}>
            <i className="ti ti-file-spreadsheet"/>Version tableur (CSV)
          </button>
        </div>

        {company?.sectors_enabled && (
          <div className="card" style={{borderLeft:'3px solid var(--green)'}}>
            <div className="card-title">Rapport d'activité par secteur</div>
            <div style={{fontSize:'12px',color:'var(--text2)',lineHeight:'1.55',marginBottom:'12px'}}>
              Répartition des heures par secteur et par personne. Document interne, utile pour
              facturer un client ou un chantier — il ne remplace pas la feuille d'heures.
            </div>

            <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
              <span className={`chip ${reportScope==='month'?'c-on':'c-off'}`}
                onClick={()=>setReportScope('month')}>{MONTHS[selMonth]}</span>
              <span className={`chip ${reportScope==='year'?'c-on':'c-off'}`}
                onClick={()=>setReportScope('year')}>Année {year}</span>
            </div>

            {reportTotals().length === 0 ? (
              <div style={{fontSize:'13px',color:'var(--text3)',padding:'6px 0 12px'}}>
                Aucune heure attribuée à un secteur sur cette période.
              </div>
            ) : (
              <div style={{marginBottom:'12px'}}>
                {reportTotals().map(t => {
                  const g = reportTotals().reduce((a,x)=>a+x.hours,0)
                  const pct = g>0 ? Math.round(t.hours/g*100) : 0
                  return (
                    <div key={t.sector} style={{display:'flex',alignItems:'baseline',gap:'10px',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:'14px',fontWeight:'700',flex:1}}>{t.sector}</span>
                      <span style={{fontSize:'11px',color:'var(--text3)'}}>{pct} %</span>
                      <span style={{fontSize:'14px',fontWeight:'800',fontFamily:'var(--mono)',minWidth:'56px',textAlign:'right'}}>{fmtH(t.hours)}</span>
                    </div>
                  )
                })}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',paddingTop:'10px'}}>
                  <span style={{fontSize:'13px',color:'var(--text2)'}}>Total attribué</span>
                  <span style={{fontSize:'17px',fontWeight:'800',fontFamily:'var(--mono)'}}>
                    {fmtH(reportTotals().reduce((a,t)=>a+t.hours,0))}
                  </span>
                </div>
              </div>
            )}

            <button className="btn btn-g" onClick={generateReport} disabled={generating||reportTotals().length===0}>
              <i className="ti ti-chart-pie"/>Rapport — {reportScope==='year' ? year : MONTHS[selMonth]}
            </button>
          </div>
        )}

      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <Link to="/admin/chat" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-message-2"/>Chat</div></Link>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )

  async function generateReport() {
    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')
    }
    setGenerating(true)
    try {
      const { jsPDF } = window.jspdf
      const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' })
      const W=297, lm=12, uw=W-lm*2
      const co = company?.name||'Mon entreprise'
      const DARK=[26,26,46], MID=[46,46,94], GREEN=[29,158,117], GREEN_BG=[225,245,238]
      const label = reportScope==='year' ? String(year) : MONTHS[selMonth]+' '+year
      const genDate = format(new Date(),'dd/MM/yyyy HH:mm')

      const totals = reportTotals()
      const grand  = totals.reduce((a,t)=>a+t.hours,0)

      doc.setFillColor(...DARK); doc.rect(lm,8,uw,10,'F')
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12)
      doc.text(`RAPPORT D'ACTIVITÉ PAR SECTEUR · ${co.toUpperCase()} · ${label.toUpperCase()}`, W/2, 14.5, {align:'center'})

      doc.setFillColor(244,244,250); doc.rect(lm,18,uw,7,'F')
      doc.setTextColor(136,136,136); doc.setFont('helvetica','normal'); doc.setFontSize(8)
      doc.text(`Généré le ${genDate}  ·  Document interne — non destiné au contrôle des heures`, W/2, 22.5, {align:'center'})

      if (totals.length === 0) {
        doc.setTextColor(...DARK); doc.setFont('helvetica','normal'); doc.setFontSize(11)
        doc.text("Aucune heure attribuée à un secteur sur cette période.", W/2, 60, {align:'center'})
      } else {
        const withHours = emps.filter(e => reportSectorsFor(e.id).length > 0)
        const rows = totals.map(t => {
          const per = withHours.map(e => {
            const f = reportSectorsFor(e.id).find(x => x.sector === t.sector)
            return f ? fmtH(f.hours) : '—'
          })
          const pct = grand>0 ? Math.round(t.hours/grand*100)+' %' : '—'
          return [t.sector, ...per, pct, fmtH(t.hours)]
        })
        rows.push(['TOTAL',
          ...withHours.map(e => fmtH(reportSectorsFor(e.id).reduce((a,x)=>a+x.hours,0))),
          '100 %', fmtH(grand)])

        doc.autoTable({
          startY: 30,
          head: [['SECTEUR', ...withHours.map(e => e.full_name.toUpperCase()), 'PART', 'TOTAL']],
          body: rows,
          headStyles:{ fillColor:MID, textColor:[255,255,255], fontStyle:'bold', fontSize:8, halign:'center' },
          bodyStyles:{ fontSize:9, cellPadding:3.5 },
          alternateRowStyles:{ fillColor:[248,248,252] },
          margin:{ left:lm, right:lm },
          didParseCell: d => {
            d.cell.styles.halign = d.column.index===0 ? 'left' : 'right'
            if (d.section==='body' && d.row.index === rows.length-1) {
              d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=GREEN_BG
              if (d.column.index === rows[0].length-1) d.cell.styles.textColor=GREEN
            }
            if (d.section==='body' && d.column.index === rows[0].length-1) d.cell.styles.fontStyle='bold'
          },
        })

        doc.setTextColor(120,120,130); doc.setFont('helvetica','normal'); doc.setFontSize(7.5)
        doc.text("Le temps de pause n'est attribué à aucun secteur. Les périodes en cours (non clôturées) sont exclues.", lm, doc.lastAutoTable.finalY+6)
      }

      doc.setTextColor(180,180,180); doc.setFont('helvetica','italic'); doc.setFontSize(6.5)
      doc.text(`Pointly · ${co} · ${label}`, W/2, 206, {align:'center'})

      doc.save(`Rapport-secteurs_${co.replace(/ /g,'_')}_${label.replace(/ /g,'_')}.pdf`)
      showToast("Rapport d'activité téléchargé")
    } catch(err) {
      showToast('Erreur : '+err.message)
    }
    setGenerating(false)
  }

  function exportCSV() {
    const co = company?.name||'Pointly'
    const monthLabel = MONTHS[selMonth]+' '+year
    const lines = ['\uFEFFEntreprise;Mois;Employé;Poste;Date;Arrivée;Deb.Pause;Fin Pause;Départ;Pause;Heures net;Modifié;Remarque']
    emps.forEach(emp => {
      const period = getCyclePeriod(emp.cycle||'1-1', selMonth, year)
      const days = safeDaysInterval(period.start, period.end)
      days.forEach(day => {
        const key = format(day,'yyyy-MM-dd')
        const log = allLogs.find(l=>l.user_id===emp.id&&l.log_date===key)
        if (!log?.punched_in) return
        lines.push([co,monthLabel,emp.full_name,emp.poste||'—',format(day,'dd/MM/yyyy'),
          fmtTime(log.punched_in),log.pause_start?fmtTime(log.pause_start):'—',log.pause_end?fmtTime(log.pause_end):'—',
          log.punched_out?fmtTime(log.punched_out):'—',
          log.pause_start&&log.pause_end?Math.round((new Date(log.pause_end)-new Date(log.pause_start))/60000)+' min':'—',
          fmtH(log.net_hours||0),log.is_modified?'OUI':'Non',log.remark||''].join(';'))
      })
    })
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a'); a.href=url
    a.download=`Feuille-heures_${co.replace(/ /g,'_')}_${monthLabel.replace(/ /g,'_')}.csv`
    a.click(); URL.revokeObjectURL(url)
    showToast('CSV téléchargé')
  }
}
