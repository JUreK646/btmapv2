import {useEffect,useState} from 'react';
import {ArrowRight,CheckCircle2,LogOut,Radio,Send,ShieldCheck} from 'lucide-react';
import Modal from './Modal';
import type {Submission,Tower,User} from '../types';
import {api,formatDate,post} from '../lib/api';
import {useI18n} from '../lib/i18n';

export function AuthDialog({onClose,authenticate}:{onClose:()=>void;authenticate:(mode:'login'|'register',data:unknown)=>Promise<User>}){
  const {t} = useI18n();
  const [mode,setMode]=useState<'login'|'register'>('login'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try{
      await authenticate(mode,data);
      onClose();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  };

  return <Modal title={mode==='login' ? t.authWelcomeBack : t.authJoinBtmap} onClose={onClose}>
    <p className="modal-intro">{mode==='login' ? t.authIntroLogin : t.authIntroRegister}</p>
    <form className="form-stack" onSubmit={submit}>
      {mode==='register'&&<label className="field">{t.authUsername}<input name="nick" autoComplete="nickname" minLength={2} maxLength={40} required/></label>}
      <label className="field">
        {mode==='login' ? t.authLoginOrEmail : t.authEmail}
        <input name="email" type={mode==='login'?'text':'email'} autoComplete="username" maxLength={254} required placeholder={mode==='login' ? t.authPlaceholderLogin : t.authPlaceholderEmail}/>
      </label>
      <label className="field">
        {t.authPassword}
        <input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='register'?10:1} maxLength={128} required/>
        {mode==='register'&&<small>{t.authMinChars}</small>}
      </label>
      {error&&<p role="alert" className="form-error">{error}</p>}
      <button className="primary-button full-width" disabled={busy}>
        {busy ? t.authWait : mode==='login' ? t.authSignIn : t.authCreateAccount}
        <ArrowRight size={17}/>
      </button>
      <button className="text-button" type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}>
        {mode==='login' ? t.authNoAccount : t.authHasAccount}
      </button>
    </form>
  </Modal>;
}

export function SubmitDialog({onClose,tower,onSuccess}:{onClose:()=>void;tower:Tower;onSuccess:()=>void}){
  const {t} = useI18n();
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    setError('');
    setBusy(true);
    const data=Object.fromEntries(new FormData(e.currentTarget));
    try{
      await post('/submit',{type:'REPORT',data:{...data,towerId:tower.id}});
      setDone(true);
      onSuccess();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  };

  return <Modal title={t.submitReportTitle} onClose={onClose}>
    {done ? (
      <div className="success-state">
        <CheckCircle2 size={38}/>
        <h3>{t.submitReportSuccess}</h3>
        <p>{t.submitReportSuccessDesc}</p>
        <button className="primary-button" onClick={onClose}>{t.close}</button>
      </div>
    ) : (
      <>
        <p className="modal-intro">{tower.address}<br/>ID: {tower.stationId || tower.id}</p>
        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            {t.submitCategoryLabel}
            <select name="category" required>
              <option value="location">{t.submitCatLocation}</option>
              <option value="bands">{t.submitCatBands}</option>
              <option value="other">{t.submitCatOther}</option>
            </select>
          </label>
          <label className="field">
            {t.submitNotesLabel}
            <textarea name="notes" rows={5} minLength={10} maxLength={2000} required placeholder={t.submitNotesPlaceholder}/>
          </label>
          <p className="muted report-hint">{t.submitModerationHint}</p>
          {error&&<p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-width" disabled={busy}>
            <Send size={16}/>
            {busy ? t.submitSending : t.submitSendButton}
          </button>
        </form>
      </>
    )}
  </Modal>;
}

export function ProfileDialog({user,onClose,onLogout,onAdmin}:{user:User;onClose:()=>void;onLogout:()=>Promise<void>;onAdmin:()=>void}){
  const {t} = useI18n();
  const [items,setItems]=useState<Submission[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    api<Submission[]>('/my/submissions').then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[]);

  return <Modal title={t.profileTitle} onClose={onClose}>
    <div className="profile-identity">
      <span className="avatar large">{user.nick.slice(0,1).toUpperCase()}</span>
      <div>
        <h3>{user.nick}</h3>
        <p>{user.email}</p>
      </div>
    </div>
    <h3>{t.profileSubmissions}</h3>
    {error&&<p className="form-error">{error}</p>}
    {loading ? (
      <p className="muted">{t.profileLoading}</p>
    ) : items.length ? (
      <div className="submission-list">
        {items.map(i=><div key={i.id}>
          <Radio size={17}/>
          <span>
            <strong>{i.type==='REPORT' ? t.profileReportItem : i.type==='NEW_STATION' ? t.profileNewStationItem : t.profileOlderItem}</strong>
            <small>{formatDate(i.createdAt)}</small>
          </span>
          <span className={`status-tag ${i.status.toLowerCase()}`}>
            {i.status==='PENDING' ? t.profileStatusPending : i.status==='APPROVED' ? t.profileStatusApproved : t.profileStatusRejected}
          </span>
        </div>)}
      </div>
    ) : (
      <p className="muted">{t.profileNoSubmissions}</p>
    )}
    {user.role==='ADMIN'&&<button className="secondary-button full-width" onClick={onAdmin}><ShieldCheck size={16}/>{t.profileModerationPanel}</button>}
    <button className="text-button logout-button" onClick={()=>onLogout().catch(e=>setError(e.message))}><LogOut size={16}/>{t.profileLogout}</button>
  </Modal>;
}
