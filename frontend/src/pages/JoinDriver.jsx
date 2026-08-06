import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, LogIn, Truck, XCircle } from 'lucide-react';
import { saveAuthData } from '../utils/tokenStorage';

export default function JoinDriver() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      axios.get(`/api/drivers/invite/${encodeURIComponent(code)}`),
      axios.get('/api/auth/session'),
    ]).then(([inviteResult, sessionResult]) => {
      if (cancelled) return;
      if (inviteResult.status !== 'fulfilled') {
        setError(inviteResult.reason?.response?.data?.detail || 'Ссылка недействительна или устарела.');
        setStatus('error');
        return;
      }
      setInvite(inviteResult.value.data);
      setAuthenticated(sessionResult.status === 'fulfilled');
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [code]);

  const redeem = async () => {
    setStatus('redeeming');
    setError('');
    try {
      const form = new URLSearchParams();
      form.append('invite_code', code);
      const result = await axios.post('/api/drivers/invite/redeem', form);
      const session = await axios.get('/api/auth/session');
      await saveAuthData(session.data.tg_id || result.data.user_id, session.data.role || 'driver');
      setStatus('success');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
    } catch (e) {
      if (e.response?.status === 401) {
        setAuthenticated(false);
        setStatus('ready');
        return;
      }
      setError(e.response?.data?.detail || 'Не удалось привязать профиль водителя.');
      setStatus('error');
    }
  };

  if (status === 'loading' || status === 'redeeming') {
    return (
      <InviteShell>
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {status === 'redeeming' ? 'Привязываем профиль' : 'Проверяем приглашение'}
        </h1>
      </InviteShell>
    );
  }

  if (status === 'error') {
    return (
      <InviteShell>
        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Не удалось принять приглашение</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
        <button type="button" onClick={() => navigate('/login')} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">
          На страницу входа
        </button>
      </InviteShell>
    );
  }

  if (status === 'success') {
    return (
      <InviteShell>
        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Профиль водителя привязан</h1>
        <p className="mt-2 text-sm text-gray-500">Открываем приложение…</p>
      </InviteShell>
    );
  }

  const returnTo = `/driver-invite/${encodeURIComponent(code)}`;
  return (
    <InviteShell>
      <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
        <Truck className="w-8 h-8 text-blue-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Приглашение водителя</h1>
      <p className="mt-3 font-semibold text-gray-800 dark:text-gray-100">{invite?.fio || 'Водитель'}</p>
      {invite?.categories?.length > 0 && (
        <p className="mt-1 text-sm text-gray-500">Категории: {invite.categories.join(', ')}</p>
      )}
      {authenticated ? (
        <button type="button" onClick={redeem} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white active:scale-[0.98]">
          Привязать мой аккаунт
        </button>
      ) : (
        <>
          <p className="mt-5 text-sm leading-relaxed text-gray-500">Сначала войдите через MAX. После входа вы автоматически вернётесь к этому приглашению.</p>
          <button type="button" onClick={() => navigate(`/max?return_to=${encodeURIComponent(returnTo)}`)} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]">
            <LogIn className="w-5 h-5" /> Войти через MAX
          </button>
        </>
      )}
    </InviteShell>
  );
}

function InviteShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-[2rem] bg-white dark:bg-gray-800 p-7 text-center shadow-xl border border-gray-100 dark:border-gray-700">
        {children}
      </div>
    </div>
  );
}
