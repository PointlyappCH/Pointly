import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'

export default function AdminChat() {
  const { profile, company } = useAuth()
  const [channel, setChannel] = useState('general')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  function mkIni(name=''){ const p=name.trim().split(' '); return((p[0]||'').substring(0,2)+(p[1]||'').substring(0,1)).toUpperCase() }

  async function loadMessages() {
    if (!company) return
    const { data } = await supabase.from('chat_messages')
      .select('*, profiles(full_name,color_bg,color_fg,role)')
      .eq('company_id', company.id).eq('channel', channel)
      .order('created_at', { ascending: true }).limit(100)
    setMessages(data || [])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  useEffect(() => {
    loadMessages()
    const ch = supabase.channel('chat-'+channel)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `company_id=eq.${company?.id}` }, payload => {
        setMessages(prev => [...prev, payload.new])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [company, channel])

  async function send() {
    if (!input.trim() || !company || !profile) return
    const txt = input.trim()
    setInput('')
    await supabase.from('chat_messages').insert({
      company_id: company.id, user_id: profile.id,
      channel, content: txt,
    })
  }

  const channels = [
    { key: 'general', label: '🌐 Général' },
    { key: 'kitchen', label: '🍳 Cuisine' },
    { key: 'private', label: '🔒 Privé' },
  ]

  return (
    <div className="screen">
      <div className="topbar" style={{paddingBottom:'0',flexDirection:'column',alignItems:'stretch',gap:'0'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',paddingBottom:'10px'}}>
          <Link to="/admin" style={{textDecoration:'none',color:'var(--text2)'}}><i className="ti ti-arrow-left" style={{fontSize:'22px'}}/></Link>
          <h1>Chat</h1>
        </div>
        <div className="tabs">
          {channels.map(c => (
            <div key={c.key} className={`tab ${channel===c.key?'active':''}`} onClick={()=>setChannel(c.key)}>
              {c.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'14px',display:'flex',flexDirection:'column',gap:'10px'}}>
        {messages.length===0 && <div style={{textAlign:'center',fontSize:'13px',color:'var(--text3)',padding:'20px 0'}}>Aucun message — commencez la conversation !</div>}
        {messages.map((msg, i) => {
          const isMe = msg.user_id === profile?.id
          const p = msg.profiles
          return (
            <div key={msg.id||i} style={{alignSelf:isMe?'flex-end':'flex-start',maxWidth:'82%'}}>
              {!isMe && <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'3px',display:'flex',alignItems:'center',gap:'5px'}}>
                <span style={{width:'16px',height:'16px',borderRadius:'50%',background:p?.color_bg||'#E6F1FB',color:p?.color_fg||'#185FA5',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700'}}>
                  {mkIni(p?.full_name||'')}
                </span>
                {p?.full_name?.split(' ')[0]}
              </div>}
              {isMe && <div style={{fontSize:'11px',color:'var(--text3)',marginBottom:'3px',textAlign:'right'}}>Vous</div>}
              <div className={`mb ${isMe?'mout':'min'}`}>{msg.content}</div>
              <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px',textAlign:isMe?'right':'left'}}>
                {format(new Date(msg.created_at),'HH:mm')}
                {isMe && <i className="ti ti-checks" style={{fontSize:'10px',color:'var(--green)',marginLeft:'3px'}}/>}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef}/>
      </div>

      <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',background:'var(--surface)',display:'flex',gap:'8px'}}>
        <input className="if" placeholder="Message…" style={{flex:1,padding:'10px 14px'}} value={input}
          onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/>
        <button style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--accent)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}} onClick={send}>
          <i className="ti ti-send" style={{fontSize:'17px',color:'#fff'}}/>
        </button>
      </div>

      <div className="nav">
        <Link to="/admin" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-layout-dashboard"/>Accueil</div></Link>
        <Link to="/admin/planning" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-calendar"/>Planning</div></Link>
        <Link to="/admin/team" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-users"/>Équipe</div></Link>
        <div className="nav-item active"><i className="ti ti-message-2"/>Chat</div>
        <Link to="/admin/profile" style={{textDecoration:'none',flex:1}}><div className="nav-item"><i className="ti ti-user-circle"/>Profil</div></Link>
      </div>
    </div>
  )
}
