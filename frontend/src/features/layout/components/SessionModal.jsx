import { AlertCircle, LogIn } from 'lucide-react';
import { clearAuthAndRedirect } from '../../../utils/tokenStorage';
import ModalPortal from '../../../components/ui/ModalPortal';

// Session-expired modal.
//
// BUG 2 history (see test_sandbox/REPORT.md): the previous handler called
// window.location.reload(), which re-mounted App.jsx with the same stale
// localStorage. App.jsx then took the optimistic fast-path, the next API
// call returned 401, and the same modal popped right back — infinite
// loop. The fix routes both available actions through
// clearAuthAndRedirect() which:
//   1. clears tg_id + user_role from localStorage BEFORE navigating;
//   2. POSTs /api/auth/logout best-effort so the server invalidates the
//      session row and clears the HttpOnly cookie (JS cannot do this);
//   3. hard-navigates to /login (full nav, not reload).
//
// Note: there is intentionally no inline ✕ / dismiss control on this
// modal — closing without clearing auth would put the user right back
// into the broken state. If a dismiss control is added later, it MUST
// call clearAuthAndRedirect() too.
export default function SessionModal() {
    const onAuthorize = () => clearAuthAndRedirect('/login');

    return (
        <ModalPortal>
        <div className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700">
                <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-orange-600 dark:text-orange-400">
                        <AlertCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Сессия истекла</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-8">
                        Сессия истекла. Пожалуйста, войдите заново.
                    </p>
                    <button
                        onClick={onAuthorize}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <LogIn className="w-5 h-5" /> Войти заново
                    </button>
                </div>
            </div>
        </div>
        </ModalPortal>
    );
}
