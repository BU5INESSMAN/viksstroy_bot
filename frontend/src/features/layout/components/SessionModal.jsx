import { AlertCircle, LogIn } from 'lucide-react';
import { logoutAndRedirect } from '../../../utils/tokenStorage';

export default function SessionModal() {
    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[99990] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
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
                        onClick={logoutAndRedirect}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <LogIn className="w-5 h-5" /> Войти заново
                    </button>
                </div>
            </div>
        </div>
    );
}
