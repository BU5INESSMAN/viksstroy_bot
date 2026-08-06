import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, KeyRound, MessageCircle, Send, XCircle } from 'lucide-react';
import { saveAuthData, loadAuthData } from '../utils/tokenStorage';
import { ensureLoginDevice, getDeviceName, getLoginDeviceToken } from '../utils/loginDevice';
import { loginWithPasskey, passkeysSupported } from '../utils/passkeys';

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
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [hasLoginDevice, setHasLoginDevice] = useState(() => !!getLoginDeviceToken());
  const [showCode, setShowCode] = useState(() => !passkeysSupported() && !getLoginDeviceToken());

  const navigate = useNavigate();
  const passkeyAvailable = passkeysSupported();

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

  const startMaxLogin = async () => {
    const deviceToken = getLoginDeviceToken();
    if (!deviceToken) {
      setMaxStatus('error');
      setMaxError('Сначала войдите кодом один раз, чтобы привязать это устройство.');
      setShowCode(true);
      return;
    }
    setMaxStatus('sending');
    setMaxError('');
    try {
      const fd = new FormData();
      fd.append('device_token', deviceToken);
      fd.append('device_name', getDeviceName());
      const res = await axios.post('/api/auth/max-login/start', fd);
      setMaxRequest({
        requestId: res.data.request_id,
        pollToken: res.data.poll_token,
        expiresAt: Date.now() + (res.data.expires_in * 1000),
      });
      setMaxStatus('awaiting');
    } catch (err) {
      setMaxRequest(null);
      setMaxStatus('error');
      setMaxError(err.response?.data?.detail || 'Не удалось отправить подтверждение в MAX.');
    }
  };

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
          ensureLoginDevice().catch(() => {});
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
        // Temporary mobile network interruptions should not cancel approval.
      }

      if (!cancelled) timer = window.setTimeout(poll, 1800);
    };

    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [maxRequest, maxStatus, navigate]);

  const handlePasskeyLogin = async () => {
    setError('');
    setPasskeyLoading(true);
    try {
      const data = await loginWithPasskey();
      await saveAuthData(data.tg_id, data.role);
      ensureLoginDevice().catch(() => {});
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Вход по ключу отменён или подходящий ключ не найден.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Не удалось войти по ключу доступа.');
      }
    } finally {
      setPasskeyLoading(false);
    }
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
              const token = await ensureLoginDevice().catch(() => '');
              if (token) setHasLoginDevice(true);
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

          <div className="space-y-3 mb-4">
            {passkeyAvailable && (
              <button
                type="button"
                disabled={passkeyLoading}
                onClick={handlePasskeyLogin}
                className="w-full min-h-12 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-60 text-white px-4 py-3.5 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {passkeyLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : <KeyRound className="w-5 h-5" />}
                Войти по ключу доступа
              </button>
            )}

            <button
              type="button"
              disabled={!hasLoginDevice || ['sending', 'awaiting'].includes(maxStatus)}
              onClick={startMaxLogin}
              className="w-full min-h-12 bg-[#6d5dfc] hover:bg-[#7c6eff] disabled:bg-[#6d5dfc]/30 disabled:text-white/40 text-white px-4 py-3.5 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {['sending', 'awaiting'].includes(maxStatus) ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : maxStatus === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
              ) : <MessageCircle className="w-5 h-5" />}
              {maxStatus === 'sending' && 'Отправляем в MAX…'}
              {maxStatus === 'awaiting' && 'Подтвердите вход в MAX'}
              {!['sending', 'awaiting'].includes(maxStatus) && 'Подтвердить через MAX'}
            </button>
            {!hasLoginDevice && (
              <p className="text-[11px] text-center text-white/35">
                MAX-вход появится после первого входа кодом на этом устройстве
              </p>
            )}
            {maxStatus === 'awaiting' && (
              <p className="text-xs text-center text-blue-200/80" role="status">
                Мы отправили личное сообщение с кнопками подтверждения
              </p>
            )}
            {maxError && <p className="text-xs text-center text-red-300">{maxError}</p>}
          </div>

          <button
            type="button"
            onClick={() => setShowCode((value) => !value)}
            className="mx-auto flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors mb-3"
          >
            <Send className="w-3.5 h-3.5" />
            {showCode ? 'Скрыть резервный вход' : 'Войти одноразовым кодом'}
          </button>

          {showCode && (
            <div className="border-t border-white/[0.07] pt-4">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 mb-3 text-xs text-white/45 leading-relaxed">
                Откройте <a href="https://max.ru/id222264297116_bot" target="_blank" rel="noopener noreferrer" className="text-blue-400 font-semibold">бота MAX</a>, отправьте <code className="text-blue-300 font-bold">/web</code> и введите полученный код.
              </div>
              <form onSubmit={handleCodeLogin} className="flex flex-col space-y-3">
                <div>
                  <label htmlFor="auth-code" className="block text-[10px] font-semibold text-white/25 mb-1.5 uppercase tracking-wider">Резервный код</label>
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
                      className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] text-white rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center font-mono text-2xl tracking-[0.35em] placeholder:text-white/20 placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
                  />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || loginCode.length < 6}
                    className="w-full bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all active:scale-[0.98] flex justify-center items-center"
                >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Проверка кода...
                      </span>
                    ) : 'Войти по коду'}
                </button>
              </form>
            </div>
          )}
        </Motion.div>
      </Motion.div>
    </div>
  );
}
