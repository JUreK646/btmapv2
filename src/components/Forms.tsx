import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,LogOut,Radio,Send,ShieldCheck} from 'lucide-react';
import Modal from './Modal';
import type {Submission,Tower,User} from '../types';
import {api,formatDate,post} from '../lib/api';

export function AuthDialog({onClose,authenticate}:{onClose:()=>void;authenticate:(mode:'login'|'register',data:unknown)=>Promise<User>}){
  const [mode,setMode]=useState<'login'|'register'>('login'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setError('');try{await authenticate(mode,data);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <Modal title={mode==='login'?'Dobrze Cię widzieć':'Dołącz do BTMap'} onClose={onClose}><p className="modal-intro">{mode==='login'?'Zaloguj się, aby zarządzać swoim kontem i przeglądać zgłoszenia.':'Pomóż tworzyć dokładniejszą mapę infrastruktury w Polsce.'}</p><form className="form-stack" onSubmit={submit}>{mode==='register'&&<label className="field">Nazwa użytkownika<input name="nick" autoComplete="nickname" minLength={2} maxLength={40} required/></label>}<label className="field">{mode==='login'?'Login lub e-mail':'Adres e-mail'}<input name="email" type={mode==='login'?'text':'email'} autoComplete="username" maxLength={254} required placeholder={mode==='login'?'jurek lub ty@przyklad.pl':'ty@przyklad.pl'}/></label><label className="field">Hasło<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='register'?10:1} maxLength={128} required/>{mode==='register'&&<small>Co najmniej 10 znaków.</small>}</label>{error&&<p role="alert" className="form-error">{error}</p>}<button className="primary-button full-width" disabled={busy}>{busy?'Chwila…':mode==='login'?'Zaloguj się':'Utwórz konto'}<ArrowRight size={17}/></button><button className="text-button" type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>{mode==='login'?'Nie masz konta? Zarejestruj się':'Masz już konto? Zaloguj się'}</button></form></Modal>;
}
export function SubmitDialog({onClose,tower,onSuccess}:{onClose:()=>void;tower:Tower;onSuccess:()=>void}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError('');setBusy(true);
    const data=Object.fromEntries(new FormData(e.currentTarget));
    try{await post('/submit',{type:'REPORT',data:{...data,towerId:tower.id}});setDone(true);onSuccess();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal title="Zgłoś uwagę do danych" onClose={onClose}>
    {done?<div className="success-state"><CheckCircle2 size={38}/><h3>Uwaga została wysłana</h3><p>Moderator sprawdzi zgłoszenie. Jego status znajdziesz na swoim koncie.</p><button className="primary-button" onClick={onClose}>Zamknij</button></div>:<>
      <p className="modal-intro">{tower.address}<br/>ID: {tower.stationId || tower.id}</p>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">Czego dotyczy uwaga?<select name="category" required><option value="location">Lokalizacja lub adres</option><option value="bands">Technologie i pasma</option><option value="other">Inna informacja</option></select></label>
        <label className="field">Opis problemu<textarea name="notes" rows={5} minLength={10} maxLength={2000} required placeholder="Opisz zauważoną rozbieżność i podaj informacje, które pomogą ją sprawdzić."/></label>
        <p className="muted report-hint">Uwagi trafiają do moderacji zespołu BTMap.</p>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full-width" disabled={busy}><Send size={16}/>{busy?'Wysyłanie…':'Wyślij uwagę'}</button>
      </form>
    </>}
  </Modal>;
}
export function ProfileDialog({user,onClose,onLogout,onAdmin}:{user:User;onClose:()=>void;onLogout:()=>Promise<void>;onAdmin:()=>void}){
  const [items,setItems]=useState<Submission[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{api<Submission[]>('/my/submissions').then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  return <Modal title="Twoje konto" onClose={onClose}><div className="profile-identity"><span className="avatar large">{user.nick.slice(0,1).toUpperCase()}</span><div><h3>{user.nick}</h3><p>{user.email}</p></div></div><h3>Twoje zgłoszenia</h3>{error&&<p className="form-error">{error}</p>}{loading?<p className="muted">Wczytywanie…</p>:items.length?<div className="submission-list">{items.map(i=><div key={i.id}><Radio size={17}/><span><strong>{i.type==='REPORT'?'Uwaga do danych':i.type==='NEW_STATION'?'Nowa stacja':'Starsze zgłoszenie'}</strong><small>{formatDate(i.createdAt)}</small></span><span className={`status-tag ${i.status.toLowerCase()}`}>{i.status==='PENDING'?'Oczekuje':i.status==='APPROVED'?'Sprawdzone':'Odrzucone'}</span></div>)}</div>:<p className="muted">Nie masz jeszcze zgłoszeń.</p>}{user.role==='ADMIN'&&<button className="secondary-button full-width" onClick={onAdmin}><ShieldCheck size={16}/>Panel moderacji</button>}<button className="text-button logout-button" onClick={()=>onLogout().catch(e=>setError(e.message))}><LogOut size={16}/>Wyloguj się</button></Modal>;
}
