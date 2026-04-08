import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, ClipboardList, Briefcase, Settings as SettingsIcon, User, Plus
} from 'lucide-react';

export default function BottomNav({ role, canCreateApp, isModOrBoss, isProfileModalOpen, openProfile, setGlobalCreateAppOpen }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tgId = localStorage.getItem('tg_id');

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-700 z-40 flex justify-around items-end pb-safe shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.05)] transition-colors h-[60px] sm:h-[72px] px-2 sm:px-6">

            {/* 1. Главная */}
            <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                <Home className="w-6 h-6 sm:mb-1" strokeWidth={2.5} />
                <span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Главная</span>
            </button>

            {/* 2. Заявки (MyApps) - Видят только Рабочие, Водители и Прорабы */}
            {['worker', 'driver', 'foreman'].includes(role) && (
                <button onClick={() => navigate('/my-apps')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/my-apps' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <ClipboardList className="w-6 h-6 sm:mb-1" strokeWidth={2.5} />
                    <span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Заявки</span>
                </button>
            )}

            {/* 3. РЕСУРСЫ СЛЕВА от центральной кнопки (Только для Офиса) */}
            {['moderator', 'boss', 'superadmin'].includes(role) && (
                <button onClick={() => navigate('/resources')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/resources' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <Briefcase className="w-6 h-6 sm:mb-1" strokeWidth={2.5} />
                    <span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Ресурсы</span>
                </button>
            )}

            {/* 4. Центральная кнопка СОЗДАТЬ */}
            {canCreateApp && (
                <div className="relative w-full flex flex-col justify-center items-center sm:justify-end sm:pb-2.5 h-full">
                    <button onClick={() => {navigate('/dashboard'); setGlobalCreateAppOpen(true);}} className="absolute -top-4 sm:-top-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] border-4 border-white dark:border-gray-800 transition-all active:scale-95 z-50">
                        <Plus className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                    </button>
                    <span className="hidden sm:block text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Создать</span>
                </div>
            )}

            {/* 5. РЕСУРСЫ СПРАВА от центральной кнопки (Только для Прораба) */}
            {role === 'foreman' && (
                <button onClick={() => navigate('/resources')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/resources' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <Briefcase className="w-6 h-6 sm:mb-1" strokeWidth={2.5} />
                    <span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Ресурсы</span>
                </button>
            )}

            {/* 6. Заявки (Модерация) и Система (Только для Офиса) */}
            {isModOrBoss && <button onClick={() => navigate('/review')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 relative ${location.pathname === '/review' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><ClipboardList className="w-6 h-6 sm:mb-1" strokeWidth={2.5} /><span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Заявки</span></button>}
            {isModOrBoss && <button onClick={() => navigate('/system')} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${location.pathname === '/system' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}><SettingsIcon className="w-6 h-6 sm:mb-1" strokeWidth={2.5} /><span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Система</span></button>}

            {/* 7. Профиль */}
            <button onClick={() => openProfile(tgId)} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${isProfileModalOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                <User className="w-6 h-6 sm:mb-1" strokeWidth={2.5} />
                <span className="hidden sm:block text-[10px] font-extrabold uppercase tracking-wide">Профиль</span>
            </button>
        </div>
    );
}
