import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, getDate
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

function fmtH(h){ if(!h&&h!==0)return'—'; const ih=Math.floor(h); const im=Math.round((h-ih)*60); return `${ih}h${String(im).padStart(2,'0')}` }
function fmtTime(ts){ if(!ts)return'—'; return format(parseISO(ts),'HH:mm') }

export default function AdminExport() {
  const { profile, company } = useAuth()
  const [selMonth, setSelMonth] = useState(new Date().getMonth())
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

  // ── Générer PDF ──
  async function generatePDF() {
    setGenerating(true)
    showToast('Chargement jsPDF…')

    if (!window.jspdf) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')
    }

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

      emps.forEach((emp, empIdx) => {
        if (empIdx > 0) doc.addPage('a4','landscape')

        const period = getCyclePeriod(emp.cycle||'1-1', selMonth, year)
        const days   = eachDayOfInterval({ start: period.start, end: period.end })
        const empLogs = allLogs.filter(l => l.user_id === emp.id)
        const logMap  = {}
        empLogs.forEach(l => { logMap[l.log_date] = l })

        // Header
        doc.setFillColor(...DARK); doc.rect(lm,8,uw,10,'F')
        doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12)
        doc.text(`POINTLY — RELEVÉ MENSUEL · ${co.toUpperCase()} · ${monthLabel.toUpperCase()}`, W/2, 14.5, {align:'center'})

        doc.setFillColor(244,244,250); doc.rect(lm,18,uw,7,'F')
        doc.setTextColor(136,136,136); doc.setFont('helvetica','normal'); doc.setFontSize(8)
        doc.text(`Période : ${format(period.start,'dd/MM/yyyy')} → ${format(period.end,'dd/MM/yyyy')}  ·  Généré le ${genDate}  ·  Document officiel non modifiable`, W/2, 22.5, {align:'center'})

        // Infos employé
        doc.setFillColor(...BLUE_BG); doc.rect(lm,25,uw,14,'F')
        doc.setDrawColor(...BLUE); doc.rect(lm,25,uw,14,'S')
        const cw4=uw/4
        const inf1=[['Employé',emp.full_name],['Poste',emp.poste||'—'],['Contrat',emp.contract==='heure'?'À l\'heure':'Fixe mensuel'],['Initiales',mkIni(emp.full_name)]]
        inf1.forEach(([lbl,val],i) => {
          const x=lm+i*cw4+3
          doc.setTextColor(...BLUE); doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.text(lbl,x,29)
          doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(val,x,34)
        })
        const inf2=[['H. dues/mois',fmtH(emp.h_due||169)+'h'],['Vacances droit',(emp.vac_droit||20)+' j'],['Vacances pris',(emp.vac_pris||0)+' j'],['Vacances rest.',((emp.vac_droit||20)-(emp.vac_pris||0))+' j']]
        inf2.forEach(([lbl,val],i) => {
          const x=lm+i*cw4+3
          doc.setTextColor(100,100,130); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.text(lbl,x,37.5)
          doc.setTextColor(...DARK); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(val,x,41)
        })

        // Tableau
        const cw=[18,16,18,16,16,14,14,16,0]
        const totCW=cw.reduce((a,b)=>a+b,0); cw[8]=uw-totCW

        const rows=[]; let totalNet=0; let workedDays=0
        days.forEach(day => {
          const key = format(day,'yyyy-MM-dd')
          const log = logMap[key]
          if (!log?.punched_in) return
          workedDays++
          const nh = log.net_hours||0; totalNet+=nh
          rows.push({
            v:[format(day,'dd/MM'),fmtTime(log.punched_in),log.pause_start?fmtTime(log.pause_start):'—',log.pause_end?fmtTime(log.pause_end):'—',log.punched_out?fmtTime(log.punched_out):'—',
              log.pause_start&&log.pause_end?`${Math.round((new Date(log.pause_end)-new Date(log.pause_start))/60000)} min`:'—',
              fmtH(nh), log.is_modified?'✓ OUI':'Non', log.remark||''],
            mod: log.is_modified
          })
        })

        doc.autoTable({
          startY:43,
          head:[['DATE','ARRIVÉE','DÉB.PAUSE','FIN PAUSE','DÉPART','PAUSE','HEURES NET','MODIFIÉ','REMARQUE']],
          body:rows.map(r=>r.v),
          columnStyles:Object.fromEntries(cw.map((w,i)=>([i,{cellWidth:w,halign:i===8?'left':'center'}]))),
          headStyles:{fillColor:MID,textColor:[255,255,255],fontStyle:'bold',fontSize:7.5,halign:'center',cellPadding:2.5},
          bodyStyles:{fontSize:7.5,cellPadding:2.5},
          alternateRowStyles:{fillColor:[248,248,252]},
          margin:{left:lm,right:lm},
          tableLineColor:GREY,tableLineWidth:0.3,
          didParseCell(data){
            if(data.section==='body'){
              const r=rows[data.row.index]
              if(r?.mod){ data.cell.styles.fillColor=MODIF_BG; if(data.column.index===7)data.cell.styles.textColor=MODIF_FG }
              if(data.column.index===6){ data.cell.styles.textColor=GREEN; data.cell.styles.fontStyle='bold' }
            }
          }
        })

        const aty = doc.lastAutoTable.finalY+4
        const hDue=emp.h_due||169; const hSupp=totalNet-hDue
        const sBg=hSupp>=0?GREEN_BG:RED_BG; const sFg=hSupp>=0?GREEN:RED
        const cw6=uw/6
        const ri=[
          {l:'TOTAL TRAVAILLÉ',v:fmtH(totalNet)+'h',bg:GREEN_BG,fg:GREEN},
          {l:'HEURES DUES',v:fmtH(hDue)+'h',bg:BLUE_BG,fg:BLUE},
          {l:'H. SUPP.',v:(hSupp>=0?'+':'')+hSupp.toFixed(2)+'h',bg:sBg,fg:sFg},
          {l:'VAC. RESTANTES',v:((emp.vac_droit||20)-(emp.vac_pris||0))+' j',bg:ORANGE_BG,fg:[239,159,39]},
          {l:'JOURS TRAVAILLÉS',v:workedDays+' j',bg:[245,245,250],fg:DARK},
          {l:'STATUT',v:hSupp>=0?'✓ Positif':'⚠ Négatif',bg:sBg,fg:sFg},
        ]
        ri.forEach((item,i) => {
          const rx=lm+i*cw6
          doc.setFillColor(...item.bg); doc.rect(rx,aty,cw6,12,'F')
          doc.setDrawColor(...GREY); doc.rect(rx,aty,cw6,12,'S')
          doc.setTextColor(120,120,130); doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.text(item.l,rx+cw6/2,aty+4,{align:'center'})
          doc.setTextColor(...item.fg); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(item.v,rx+cw6/2,aty+10,{align:'center'})
        })

        // Signatures
        const sy=aty+16
        doc.setFillColor(248,248,252); doc.rect(lm,sy,uw,14,'F')
        doc.setDrawColor(...GREY); doc.rect(lm,sy,uw,14,'S')
        const cw3=uw/3
        [["Signature de l'employé","________________________"],["Signature de l'employeur","________________________"],["Date de validation","________________________"]].forEach((sig,i) => {
          const sx=lm+i*cw3+cw3/2
          doc.setTextColor(150,150,150); doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.text(sig[0],sx,sy+5,{align:'center'})
          doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(sig[1],sx,sy+11,{align:'center'})
        })

        // Pied
        doc.setTextColor(180,180,180); doc.setFont('helvetica','italic'); doc.setFontSize(6.5)
        doc.text(`Pointly · ${co} · ${monthLabel} · Non modifiable · ${empIdx+1}/${emps.length}`, W/2, 206, {align:'center'})

        // Filigrane
        doc.saveGraphicsState(); doc.setGState(new doc.GState({opacity:0.03}))
        doc.setTextColor(...DARK); doc.setFont('helvetica','bold'); doc.setFontSize(55)
        doc.text('OFFICIEL', W/2, 105, {align:'center',angle:35})
        doc.restoreGraphicsState()
      })

      // Page récap équipe
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
          fmtH(total)+'h', fmtH(hDue)+'h',
          (total-hDue>=0?'+':'')+fmtH(Math.abs(total-hDue))+'h',
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
      doc.text(`Pointly · ${co} · ${monthLabel} · Document officiel non modifiable`, W/2, 206, {align:'center'})

      doc.save(`Pointly_${co.replace(/ /g,'_')}_${monthLabel.replace(/ /g,'_')}.pdf`)
      showToast('✅ PDF téléchargé !')
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

  // Récap mensuel pour l'aperçu
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
        {/* Sélecteur mois */}
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

        {/* Aperçu récap */}
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
                  <div style={{fontSize:'15px',fontWeight:'800'}}>{fmtH(emp.total)}h</div>
                  <div style={{fontSize:'11px',fontWeight:'700',color:emp.supp>=0?'var(--green)':'var(--red)'}}>
                    {emp.supp>=0?'+':''}{fmtH(Math.abs(emp.supp))}h supp.
                  </div>
                </div>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',marginTop:'4px'}}>
              <span style={{fontSize:'14px',color:'var(--text2)'}}>Total équipe</span>
              <span style={{fontSize:'18px',fontWeight:'800'}}>{fmtH(summaries.reduce((a,e)=>a+e.total,0))}h</span>
            </div>
          </div>
        )}

        {emps.length===0 && (
          <div className="card" style={{textAlign:'center',padding:'24px'}}>
            <div style={{fontSize:'14px',color:'var(--text2)'}}>Aucun employé — <Link to="/admin/team" style={{color:'var(--accent)'}}>ajoutez votre équipe →</Link></div>
          </div>
        )}

        {/* Boutons export */}
        <button className="btn btn-r" onClick={generatePDF} disabled={generating||emps.length===0}>
          {generating
            ? <><div className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px',borderColor:'rgba(255,255,255,.3)',borderTopColor:'#fff'}}/> Génération…</>
            : <><i className="ti ti-file-type-pdf"/>Exporter PDF officiel</>
          }
        </button>
        <button className="btn btn-s" onClick={exportCSV} disabled={emps.length===0}>
          <i className="ti ti-file-spreadsheet"/>Exporter CSV
        </button>
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

  function exportCSV() {
    const co = company?.name||'Pointly'
    const monthLabel = MONTHS[selMonth]+' '+year
    const lines = ['\uFEFFEntreprise;Mois;Employé;Poste;Date;Arrivée;Deb.Pause;Fin Pause;Départ;Pause;Heures net;Modifié;Remarque']
    emps.forEach(emp => {
      const period = getCyclePeriod(emp.cycle||'1-1', selMonth, year)
      const days = eachDayOfInterval({ start:period.start, end:period.end })
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
    a.download=`Pointly_${co.replace(/ /g,'_')}_${monthLabel.replace(/ /g,'_')}.csv`
    a.click(); URL.revokeObjectURL(url)
    showToast('CSV téléchargé ✅')
  }
}
