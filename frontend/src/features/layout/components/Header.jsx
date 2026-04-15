import { ShieldCheck, Bell } from 'lucide-react';
import { ROLE_NAMES as roleNames } from '../../../utils/roleConfig';

export default function Header({ isTMA, realRole, role, unreadCount = 0, onlineCount = 0, onNotificationsClick, onOnlineClick }) {
    const endRoleTest = () => {
        localStorage.setItem('user_role', realRole);
        localStorage.removeItem('real_role');
        window.location.reload();
    };

    return (
        <header className="w-full max-w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700/80 mb-4" style={{ paddingTop: isTMA ? 64 : 'env(safe-area-inset-top, 16px)' }}>
            {realRole && (
                <div className="bg-purple-600 text-white text-center py-2.5 font-bold flex justify-center items-center space-x-4 relative z-50 shadow-sm text-sm">
                    <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Тест роли: {roleNames[role]}</span>
                    <button onClick={endRoleTest} className="bg-white/20 px-4 py-1.5 rounded-lg text-xs transition-colors active:scale-95">Вернуться</button>
                </div>
            )}
            <nav className="px-4 sm:px-6 py-2.5 flex items-center justify-between max-w-7xl mx-auto gap-3">
                {/* Left: notification bell */}
                <button
                    onClick={onNotificationsClick}
                    className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 transition-colors active:scale-95"
                >
                    <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* Center: logo */}
                <div className="flex-1 flex justify-center">
                    <img src="/logo-dark.svg" alt="ВиКС" className="h-7 w-auto dark:hidden" />
                    <img src="/logo-white.svg" alt="ВиКС" className="h-7 w-auto hidden dark:block" />
                </div>

                {/* Right: online counter */}
                <button
                    onClick={onOnlineClick}
                    className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 transition-colors active:scale-95"
                >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-semibold tabular-nums">{onlineCount}</span>
                </button>
            </nav>
        </header>
    );
}
