import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Truck, CheckCircle, XCircle, LogIn } from 'lucide-react';
import { saveAuthData } from '../utils/tokenStorage';

/**
 * Legacy equipment-invite landing page.
 *
 * v2.6 commit 7 rewrite: this page used to bind the redeemer's
 * Telegram/MAX account to a specific piece of equipment. v2.6 inverted
 * that model — drivers are now independent ``users`` rows with their own
 * personal ``invite_code``. The legacy URL pattern
 * ``/equip-invite/{code}`` is kept alive for users with saved/bookmarked
 * links: clicking such a link now redeems them as the equipment's
 * **default driver** (set on the Equipment page by office) via the
 * new bridge endpoint, then drops them into the app authenticated.
 *
 * Flow:
 *   1. POST /api/auth/equip_invite_bridge with the URL code.
 *   2. On 200 — backend issued a session for the equipment's default
 *      driver and invalidated the code. We save user_id+role in
 *      localStorage and navigate to /dashboard.
 *   3. On 400 ("no default driver") or 404 — render a friendly error
 *      pointing the user at the dispatcher.
 *
 * The previous GET /api/equipment/invite/{code} preview + manual
 * confirm-modal flow is gone. The bridge is one-click by design — the
 * link itself is the redemption, just like an email-confirmation link.
 */
export default function JoinEquipment() {
    const { code } = useParams();
    const navigate = useNavigate();

    const [status, setStatus] = useState('redeeming'); // 'redeeming' | 'ok' | 'error'
    const [errorMsg, setErrorMsg] = useState('');
    const [user, setUser] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function redeem() {
            try {
                const fd = new FormData();
                fd.append('code', code);
                const res = await axios.post(
                    '/api/auth/equip_invite_bridge',
                    fd,
                    { withCredentials: true },
                );
                if (cancelled) return;
                const { tg_id, role, fio } = res.data || {};
                if (tg_id) {
                    await saveAuthData(tg_id, role);
                    setUser({ tg_id, role, fio });
                    setStatus('ok');
                    // Brief celebratory state before navigating so the
                    // user knows what happened — 1.5s is enough to read
                    // the ФИО + role.
                    setTimeout(() => {
                        if (!cancelled) navigate('/dashboard', { replace: true });
                    }, 1500);
                } else {
                    setStatus('error');
                    setErrorMsg('Не удалось получить данные сессии.');
                }
            } catch (e) {
                if (cancelled) return;
                setStatus('error');
                setErrorMsg(e.response?.data?.detail || 'Ссылка недействительна.');
            }
        }
        redeem();

        return () => { cancelled = true; };
    }, [code, navigate]);

    if (status === 'redeeming') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-blue-500">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-1 dark:text-white">Привязка водителя</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Проверяем ссылку…</p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-red-500">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2 dark:text-white">Ссылка устарела</h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm font-medium leading-relaxed mb-6">
                        {errorMsg}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        В v2.6 водители используют личный код входа. Обратитесь
                        к диспетчеру за новой ссылкой или войдите через бот.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="mt-6 w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] flex justify-center items-center gap-2"
                    >
                        <LogIn className="w-5 h-5" /> На страницу входа
                    </button>
                </div>
            </div>
        );
    }

    // status === 'ok' — brief success splash before redirect.
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-[2rem] shadow-xl max-w-sm w-full border-t-4 border-emerald-500">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold dark:text-white mb-2 tracking-tight">Добро пожаловать!</h2>
                <p className="text-gray-700 dark:text-gray-200 font-bold mb-1">{user?.fio || '—'}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider">
                    {user?.role || 'driver'}
                </p>
                <p className="text-gray-400 text-xs mt-5">Перенаправляем на главную…</p>
                <Truck className="w-5 h-5 text-blue-400 mx-auto mt-3 opacity-70" />
            </div>
        </div>
    );
}
