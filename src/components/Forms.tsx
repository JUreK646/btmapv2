import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LogOut, Radio, Send, ShieldCheck, Sparkles } from 'lucide-react';
import Modal from './Modal';
import type { Submission, Tower, User } from '../types';
import { api, formatDate, post } from '../lib/api';

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AuthDialog({
  onClose,
  authenticate,
  onGoogleAuth,
}: {
  onClose: () => void;
  authenticate: (mode: 'login' | 'register', data: unknown) => Promise<User>;
  onGoogleAuth?: (payload: { credential?: string; devUser?: { email: string; name?: string; picture?: string } }) => Promise<User>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleConfig, setGoogleConfig] = useState<{ enabled: boolean; configured: boolean; clientId: string | null } | null>(null);
  const [showDevGoogle, setShowDevGoogle] = useState(false);
  const [devEmail, setDevEmail] = useState('tester.google@btmap.pl');
  const [devName, setDevName] = useState('Tester Google');

  useEffect(() => {
    api<{ enabled: boolean; configured: boolean; clientId: string | null }>('/auth/google/config')
      .then(setGoogleConfig)
      .catch(() => setGoogleConfig({ enabled: false, configured: false, clientId: null }));
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        onClose();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await authenticate(mode, data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleClick = async () => {
    setError('');
    if (googleConfig?.configured) {
      setBusy(true);
      try {
        const res = await api<{ url: string }>('/auth/google/url');
        const width = 500;
        const height = 620;
        const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
        const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
        const popup = window.open(
          res.url,
          'google_oauth_popup',
          `width=${width},height=${height},left=${left},top=${top},status=0,toolbar=0,menubar=0,location=0`
        );
        if (!popup) {
          window.location.href = res.url;
        }
      } catch (err) {
        setError((err as Error).message || 'Nie udało się otworzyć okna logowania Google');
      } finally {
        setBusy(false);
      }
    } else {
      setShowDevGoogle(true);
    }
  };

  const handleDevGoogleLogin = async () => {
    const emailToUse = devEmail.trim().toLowerCase();
    if (!emailToUse || !emailToUse.includes('@')) {
      setError('Podaj poprawny adres e-mail.');
      return;
    }
    const nameToUse = devName.trim() || emailToUse.split('@')[0];
    setBusy(true);
    setError('');
    try {
      const payload = {
        devUser: {
          email: emailToUse,
          name: nameToUse,
          picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(nameToUse)}`,
        },
      };
      if (onGoogleAuth) {
        await onGoogleAuth(payload);
      } else {
        await post('/auth/google', payload);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === 'login' ? 'Dobrze Cię widzieć' : 'Dołącz do BTMap'} onClose={onClose}>
      <p className="modal-intro">
        {mode === 'login'
          ? 'Zaloguj się, aby zarządzać swoim kontem i przeglądać zgłoszenia.'
          : 'Pomóż tworzyć dokładniejszą mapę infrastruktury w Polsce.'}
      </p>

      {showDevGoogle ? (
        <div className="google-dev-box">
          <div className="google-dev-header">
            <GoogleIcon size={18} />
            <strong>Logowanie testowe Google</strong>
            <span className="dev-tag">DEV</span>
          </div>
          <p className="google-dev-hint">
            W pliku <code>.env</code> nie dodano jeszcze <code>GOOGLE_CLIENT_ID</code>. Możesz natychmiast przetestować logowanie z kontem Google w trybie deweloperskim:
          </p>
          <div className="google-dev-fields">
            <label className="field">
              Adres e-mail konta Google
              <input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="twoj.mail@gmail.com"
                required
              />
            </label>
            <label className="field">
              Imię i nazwisko lub nick
              <input
                type="text"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                placeholder="Jan Kowalski"
              />
            </label>
          </div>
          <div className="google-dev-actions">
            <button
              type="button"
              className="primary-button full-width"
              disabled={busy}
              onClick={handleDevGoogleLogin}
            >
              <Sparkles size={16} />
              {busy ? 'Logowanie…' : `Zaloguj jako ${devEmail.trim() || 'tester.google@btmap.pl'}`}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setShowDevGoogle(false);
                setError('');
              }}
            >
              Wróć do logowania standardowego
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="google-auth-button"
            onClick={handleGoogleClick}
            disabled={busy}
          >
            <GoogleIcon size={18} />
            <span>Kontynuuj przez Google</span>
            {googleConfig && !googleConfig.configured && <span className="dev-tag">DEV</span>}
          </button>

          <div className="auth-divider">
            <span>lub przez login i hasło</span>
          </div>
        </>
      )}

      <form className="form-stack" onSubmit={submit}>
        {mode === 'register' && (
          <label className="field">
            Nazwa użytkownika
            <input name="nick" autoComplete="nickname" minLength={2} maxLength={40} required />
          </label>
        )}
        <label className="field">
          {mode === 'login' ? 'Login lub e-mail' : 'Adres e-mail'}
          <input
            name="email"
            type={mode === 'login' ? 'text' : 'email'}
            autoComplete="username"
            maxLength={254}
            required
            placeholder={mode === 'login' ? 'jurek lub ty@przyklad.pl' : 'ty@przyklad.pl'}
          />
        </label>
        <label className="field">
          Hasło
          <input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 10 : 1}
            maxLength={128}
            required
          />
          {mode === 'register' && <small>Co najmniej 10 znaków.</small>}
        </label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="primary-button full-width" disabled={busy}>
          {busy ? 'Chwila…' : mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
          <ArrowRight size={17} />
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz już konto? Zaloguj się'}
        </button>
      </form>
    </Modal>
  );
}

export function SubmitDialog({
  onClose,
  tower,
  onSuccess,
}: {
  onClose: () => void;
  tower: Tower;
  onSuccess: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post('/submit', { type: 'REPORT', data: { ...data, towerId: tower.id } });
      setDone(true);
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Zgłoś uwagę do danych" onClose={onClose}>
      {done ? (
        <div className="success-state">
          <CheckCircle2 size={38} />
          <h3>Uwaga została wysłana</h3>
          <p>Moderator sprawdzi zgłoszenie. Jego status znajdziesz na swoim koncie.</p>
          <button className="primary-button" onClick={onClose}>
            Zamknij
          </button>
        </div>
      ) : (
        <>
          <p className="modal-intro">
            {tower.address}
            <br />
            ID: {tower.stationId || tower.id}
          </p>
          <form className="form-stack" onSubmit={submit}>
            <label className="field">
              Czego dotyczy uwaga?
              <select name="category" required>
                <option value="location">Lokalizacja lub adres</option>
                <option value="bands">Technologie i pasma</option>
                <option value="other">Inna informacja</option>
              </select>
            </label>
            <label className="field">
              Opis problemu
              <textarea
                name="notes"
                rows={5}
                minLength={10}
                maxLength={2000}
                required
                placeholder="Opisz zauważoną rozbieżność i podaj informacje, które pomogą ją sprawdzić."
              />
            </label>
            <p className="muted report-hint">Uwagi trafiają do moderacji zespołu BTMap.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button full-width" disabled={busy}>
              <Send size={16} />
              {busy ? 'Wysyłanie…' : 'Wyślij uwagę'}
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}

export function ProfileDialog({
  user,
  onClose,
  onLogout,
  onAdmin,
}: {
  user: User;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onAdmin: () => void;
}) {
  const [items, setItems] = useState<Submission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Submission[]>('/my/submissions')
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Modal title="Twoje konto" onClose={onClose}>
      <div className="profile-identity">
        <span className="avatar large">
          {user.avatar ? (
            <img src={user.avatar} alt={user.nick} className="avatar-img" />
          ) : (
            user.nick.slice(0, 1).toUpperCase()
          )}
        </span>
        <div>
          <div className="profile-nick-row">
            <h3>{user.nick}</h3>
            {user.googleId && (
              <span className="google-user-badge" title="Zalogowano przez konto Google">
                <GoogleIcon size={12} /> Google
              </span>
            )}
          </div>
          <p>{user.email}</p>
        </div>
      </div>
      <h3>Twoje zgłoszenia</h3>
      {error && <p className="form-error">{error}</p>}
      {loading ? (
        <p className="muted">Wczytywanie…</p>
      ) : items.length ? (
        <div className="submission-list">
          {items.map((i) => (
            <div key={i.id}>
              <Radio size={17} />
              <span>
                <strong>
                  {i.type === 'REPORT'
                    ? 'Uwaga do danych'
                    : i.type === 'NEW_STATION'
                    ? 'Nowa stacja'
                    : 'Starsze zgłoszenie'}
                </strong>
                <small>{formatDate(i.createdAt)}</small>
              </span>
              <span className={`status-tag ${i.status.toLowerCase()}`}>
                {i.status === 'PENDING' ? 'Oczekuje' : i.status === 'APPROVED' ? 'Sprawdzone' : 'Odrzucone'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Nie masz jeszcze zgłoszeń.</p>
      )}
      {user.role === 'ADMIN' && (
        <button className="secondary-button full-width" onClick={onAdmin}>
          <ShieldCheck size={16} />
          Panel moderacji
        </button>
      )}
      <button className="text-button logout-button" onClick={() => onLogout().catch((e) => setError(e.message))}>
        <LogOut size={16} />
        Wyloguj się
      </button>
    </Modal>
  );
}
