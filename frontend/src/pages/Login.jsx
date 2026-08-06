import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, MessageCircle, RefreshCw, Send, XCircle } from 'lucide-react';
import { saveAuthData, loadAuthData } from '../utils/tokenStorage';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = [0.22, 1, 0.36, 1];
const anim = (props) => prefersReducedMotion ? {} : props;

export default function Login() {
  const [error, setError] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [maxRequest, setMaxRequest] = useState(null);
  const [maxStatus, setMaxStatus] = useState('idle');
  const [maxError, setMaxError] = useState('');

  const navigate = useNavigate();

  // Redirect already-authenticated users to dashboard
  useEffect(() => {
    // Clear the 401-redirect guard so a future expiry can redirect again.
    try { sessionStorage.removeItem('auth_redirecting'); } catch { /* silent */ }

    loadAuthData().then(stored => {
      if (stored?.tg_id && stored?.user_role) {
        navigate('/dashboard', { replace: true });
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, [navigate]);

  const prepareMaxLogin = useCallback(async () => {
    setMaxStatus('preparing');
    setMaxError('');
    try {
      const res = await axios.post('/api/auth/max-login/start');
      setMaxRequest({
        requestId: res.data.request_id,
        pollToken: res.data.poll_token,
        deepLink: res.data.deep_link,
        expiresAt: Date.now() + (res.data.expires_in * 1000),
      });
      setMaxStatus('ready');
    } catch (err) {
      setMaxRequest(null);
      setMaxStatus('error');
      setMaxError(err.response?.data?.detail || 'Не удалось подготовить вход через MAX.');
    }
  }, []);

  // Prepare the deep link in advance so the actual tap remains a direct user
  // action. This is important for iOS PWA, where delayed popups are blocked.
  useEffect(() => {
    if (!checking && maxStatus === 'idle') prepareMaxLogin();
  }, [checking, maxStatus, prepareMaxLogin]);

  useEffect(() => {
    if (maxStatus !== 'awaiting' || !maxRequest) return undefined;

    let cancelled = false;
    let timer;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= maxRequest.expiresAt) {
        setMaxStatus('expired');
        setMaxError('Время подтверждения истекло. Создайте новый запрос.');
        return;
      }

      try {
        const fd = new FormData();
        fd.append('request_id', maxRequest.requestId);
        fd.append('poll_token', maxRequest.pollToken);
        const res = await axios.post('/api/auth/max-login/poll', fd);
        if (res.data.status === 'ok') {
          cancelled = true;
          setMaxStatus('success');
          await saveAuthData(res.data.tg_id, res.data.role);
          navigate('/dashboard', { replace: true });
          return;
        }
      } catch (err) {
        const status = err.response?.status;
        if ([403, 409, 410].includes(status)) {
          setMaxStatus(status === 410 ? 'expired' : 'error');
          setMaxError(err.response?.data?.detail || 'Не удалось подтвердить вход через MAX.');
          return;
        }
        // A temporary network interruption is expected when switching from
        // the PWA to MAX. Keep waiting and retry when the PWA becomes active.
      }

      if (!cancelled) timer = window.setTimeout(poll, 1800);
    };

    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [maxRequest, maxStatus, navigate]);

  const handleMaxOpen = () => {
    setMaxError('');
    setMaxStatus('awaiting');
  };

  const handleCodeLogin = async (e) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      try {
          const fd = new FormData();
          fd.append('code', loginCode);
          const res = await axios.post('/api/auth/code', fd);

          if (res.data.status === 'ok') {
              await saveAuthData(res.data.tg_id, res.data.role);
              navigate('/dashboard');
          }
      } catch (err) {
          setError(err.response?.data?.detail || 'Ошибка авторизации. Проверьте правильность кода.');
      } finally {
          setIsLoading(false);
      }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[400px] h-[400px] bg-purple-600/[0.08] rounded-full blur-[120px]" />
      </div>

      <Motion.div
        className="max-w-md w-full relative z-10"
        {...anim({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease } })}
      >
        {/* ── Logo ── */}
        <Motion.div
          className="flex items-center justify-center mb-6"
          {...anim({ initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.6, delay: 0.1, ease } })}
        >
          <img src="/logo-white.svg" alt="ВиКС" className="h-10 w-auto" />
        </Motion.div>

        {/* ── Card ── */}
        <Motion.div
          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-5 sm:p-6 relative overflow-hidden"
          {...anim({ initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.2, ease } })}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          {/* Error block */}
          <AnimatePresence>
            {error && (
              <Motion.div
                className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 overflow-hidden"
                {...anim({
                  initial: { opacity: 0, y: -10, height: 0, marginBottom: 0 },
                  animate: { opacity: 1, y: 0, height: 'auto', marginBottom: 24 },
                  exit: { opacity: 0, y: -10, height: 0, marginBottom: 0 },
                  transition: { duration: 0.3 },
                })}
              >
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold text-sm text-red-300">Ошибка</p>
                    <p className="text-sm text-red-300/80 mt-0.5">{error}</p>
                    <p className="text-xs mt-2">
                        <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer" className="text-red-400/70 underline hover:text-red-300 transition-colors">Техподдержка</a>
                    </p>
                </div>
              </Motion.div>
            )}
          </AnimatePresence>

          <h2 className="text-lg font-bold text-white mb-4 text-center">Вход в систему</h2>

          {/* Experimental MAX confirmation flow. The existing code login stays below. */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.08] p-3.5 mb-4">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div>
                <p className="text-sm font-bold text-white">Быстрый вход через MAX</p>
                <p className="text-[11px] text-blue-300/70 mt-0.5">Тестовый режим</p>
              </div>
              {maxStatus === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
            </div>

            <p className="text-xs text-white/50 leading-relaxed mb-3">
              Откройте бота по кнопке, затем вернитесь сюда. ВиКС выполнит вход автоматически — вводить код не потребуется.
            </p>

            {maxRequest && !['preparing', 'error', 'expired'].includes(maxStatus) ? (
              <a
                href={maxRequest.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleMaxOpen}
                className="w-full min-h-11 bg-[#6d5dfc] hover:bg-[#7c6eff] text-white px-4 py-3 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                {maxStatus === 'awaiting' ? 'Открыть MAX ещё раз' : 'Войти через MAX'}
              </a>
            ) : (
              <button
                type="button"
                disabled={maxStatus === 'preparing'}
                onClick={prepareMaxLogin}
                className="w-full min-h-11 bg-[#6d5dfc] hover:bg-[#7c6eff] disabled:bg-[#6d5dfc]/50 text-white px-4 py-3 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${maxStatus === 'preparing' ? 'animate-spin' : ''}`} />
                {maxStatus === 'preparing' ? 'Подготовка...' : 'Подготовить новый вход'}
              </button>
            )}

            {maxStatus === 'awaiting' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-blue-200/80" role="status">
                <span className="w-3.5 h-3.5 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin flex-shrink-0" />
                Ожидаем подтверждение в MAX…
              </div>
            )}
            {maxError && <p className="mt-2.5 text-xs text-red-300">{maxError}</p>}
          </div>

          <div className="flex items-center gap-3 mb-4" aria-hidden="true">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[10px] uppercase tracking-widest text-white/25">или старый способ</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          {/* Instructions */}
          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 mb-4">
              <p className="text-sm text-white/60 mb-3 leading-relaxed">
                  Для входа на платформу с компьютера или браузера вам понадобится одноразовый код.
              </p>
              <p className="text-[11px] text-blue-400/80 mb-2.5 font-bold uppercase tracking-widest">Как получить код?</p>
              <ul className="space-y-2.5 text-sm text-white/50">
                  <li className="flex items-start gap-2.5">
                      <MessageCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
                      <span>Откройте бота <a href="https://max.ru/id222264297116_bot" className="text-blue-400 font-semibold hover:text-blue-300 transition-colors">MAX</a></span>
                  </li>
                  <li className="flex items-center gap-2.5">
                      <Send className="w-4 h-4 text-white/30 flex-shrink-0" />
                      <span>Отправьте команду <code className="bg-white/[0.08] text-blue-300 px-1.5 py-0.5 rounded border border-white/[0.06] font-mono font-bold text-xs">/web</code></span>
                  </li>
              </ul>
          </div>

          {/* Form */}
          <form onSubmit={handleCodeLogin} className="flex flex-col space-y-3">
              <div>
                <label htmlFor="auth-code" className="block text-xs font-semibold text-white/30 mb-1.5 uppercase tracking-wider">Код авторизации</label>
                <input
                    id="auth-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    aria-label="Код авторизации"
                    className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center font-mono text-3xl sm:text-4xl tracking-[0.3em] sm:tracking-[0.5em] placeholder:text-white/20 placeholder:tracking-normal placeholder:font-sans placeholder:text-lg"
                />
              </div>
              <button
                  type="submit"
                  disabled={isLoading || loginCode.length < 6}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-blue-600/50 disabled:to-blue-500/50 disabled:cursor-not-allowed text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 active:scale-[0.98] text-base flex justify-center items-center"
              >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Проверка кода...
                    </span>
                  ) : 'Войти в панель'}
              </button>
          </form>
        </Motion.div>
      </Motion.div>
    </div>
  );
}
