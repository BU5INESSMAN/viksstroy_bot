import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home, ClipboardList, Briefcase, Settings as SettingsIcon, User, Plus, MapPin, FileText, Menu, X
} from 'lucide-react';

export default function BottomNav({ role, canCreateApp, isModOrBoss, openProfile, setGlobalCreateAppOpen }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tgId = localStorage.getItem('tg_id');

    // Локальный стейт для мобильного сэндвич-меню
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const isWorkerOrDriver = ['worker', 'driver'].includes(role);
    const canSeeObjectsKP = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canSeeKP = ['brigadier', 'foreman', 'moderator', 'boss', 'superadmin'].includes(role);

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-700 z-40 flex justify-around items-end pb-safe shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.05)] transition-colors h-[60px] sm:h-[72px] px-1 sm:px-4">

                {/* 1. Главная */}
                <NavBtn icon={Home} label="Главная" path="/dashboard" current={location.pathname} onClick={() => navigate('/dashboard')} />

                {/* 2. Объекты */}
                {canSeeObjectsKP && (
                    <NavBtn icon={MapPin} label="Объекты" path="/objects" current={location.pathname} onClick={() => navigate('/objects')} />
                )}

                {/* 3. Ресурсы (Бригады + Автопарк) */}
                {canSeeObjectsKP && (
                    <NavBtn icon={Briefcase} label="Ресурсы" path="/resources" current={location.pathname} onClick={() => navigate('/resources')} />
                )}

                {/* 4. Центральная кнопка СОЗДАТЬ */}
                {canCreateApp && (
                    <div className="relative w-full flex flex-col justify-center items-center sm:justify-end sm:pb-2.5 h-full">
                        <button onClick={() => { navigate('/dashboard'); setGlobalCreateAppOpen(true); }} className="absolute -top-4 sm:-top-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] border-4 border-white dark:border-gray-800 transition-all active:scale-95 z-50">
                            <Plus className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
                        </button>
                        <span className="hidden sm:block text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wide mt-7 sm:mt-0">Создать</span>
                    </div>
                )}

                {/* 5. Заявки (Мои заявки или Модерация) */}
                <NavBtn
                    icon={ClipboardList}
                    label="Заявки"
                    path={isWorkerOrDriver ? "/my-apps" : "/review"}
                    current={location.pathname}
                    onClick={() => navigate(isWorkerOrDriver ? "/my-apps" : "/review")}
                />

                {/* 6. СМР (Прайс и выполнение) */}
                {canSeeKP && (
                    <NavBtn icon={FileText} label="СМР" path="/kp" current={location.pathname} onClick={() => navigate('/kp')} />
                )}

                {/* 7. Меню (Сэндвич) */}
                <button onClick={() => setIsMenuOpen(true)} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${isMenuOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    <Menu className="w-5 h-5 sm:w-6 sm:h-6 sm:mb-1" strokeWidth={2.5} />
                    <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wide mt-1 sm:mt-0">Меню</span>
                </button>

            </div>

            {/* ВСПЛЫВАЮЩЕЕ МЕНЮ (BOTTOM SHEET) */}
            {isMenuOpen && (
                <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 transition-opacity" onClick={() => setIsMenuOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold dark:text-white">Дополнительно</h3>
                            <button onClick={() => setIsMenuOpen(false)} className="p-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 hover:text-red-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {isModOrBoss && (
                                <button onClick={() => { setIsMenuOpen(false); navigate('/system'); }} className="w-full flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-bold text-gray-800 dark:text-white border border-gray-100 dark:border-gray-700 shadow-sm active:scale-95">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                                        <SettingsIcon className="w-5 h-5" />
                                    </div>
                                    Система и Настройки
                                </button>
                            )}
                            <button onClick={() => { setIsMenuOpen(false); openProfile(tgId); }} className="w-full flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-bold text-gray-800 dark:text-white border border-gray-100 dark:border-gray-700 shadow-sm active:scale-95">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                                    <User className="w-5 h-5" />
                                </div>
                                Мой Профиль
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Вспомогательный компонент для кнопок меню
function NavBtn({ icon: Icon, label, path, current, onClick }) {
    const isActive = current === path;
    return (
        <button onClick={onClick} className={`flex flex-col items-center justify-center sm:justify-end sm:pb-2.5 h-full w-full transition-all active:scale-95 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 sm:mb-1" strokeWidth={isActive ? 3 : 2.5} />
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wide mt-1 sm:mt-0">{label}</span>
        </button>
    );
}