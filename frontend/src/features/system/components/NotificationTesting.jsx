import {
    Shield, Zap, Rocket, UserCheck, CalendarDays,
    ClipboardCheck, AlertTriangle, ToggleLeft
} from 'lucide-react';
import { GlassCard, SectionHeader, ROLE_NAMES } from './UIHelpers';

export default function NotificationTesting({
    tgId,
    testPlatform,
    setTestPlatform,
    testNotification,
    testExtended,
    role,
    handleRoleSimulation,
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Notification Testing */}
            <GlassCard className="p-6">
                <SectionHeader icon={Zap} iconColor="text-indigo-500 bg-indigo-500" title="Отладка уведомлений" />
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-widest">Платформа</label>
                        <select value={testPlatform} onChange={(e) => setTestPlatform(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 p-3 dark:bg-gray-700/50 dark:border-gray-600 dark:text-white outline-none">
                            <option value="all">Все (MAX + Telegram)</option>
                            <option value="max">Только MAX</option>
                            <option value="tg">Только Telegram</option>
                        </select>
                    </div>

                    {/* Main test */}
                    <button onClick={testNotification}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 font-bold rounded-xl text-sm py-3 border border-indigo-200 dark:border-indigo-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                        <Rocket className="w-4 h-4" /> Полный тест
                    </button>

                    {/* Extended tests */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => testExtended('brigadier')}
                            className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50 hover:bg-violet-100 dark:hover:bg-violet-900/30">
                            <UserCheck className="w-3.5 h-3.5" /> Бригадир
                        </button>
                        <button onClick={() => testExtended('resource_freed')}
                            className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                            <Zap className="w-3.5 h-3.5" /> Ресурс свободен
                        </button>
                        <button onClick={() => testExtended('schedule_published')}
                            className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                            <CalendarDays className="w-3.5 h-3.5" /> Расписание
                        </button>
                        <button onClick={() => testExtended('kp_review')}
                            className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                            <ClipboardCheck className="w-3.5 h-3.5" /> Проверка СМР
                        </button>
                        <button onClick={() => testExtended('system_error')}
                            className="py-2.5 px-3 rounded-xl text-[11px] font-bold transition-all border active:scale-95 flex items-center justify-center gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 col-span-2">
                            <AlertTriangle className="w-3.5 h-3.5" /> Системная ошибка
                        </button>
                    </div>
                </div>
            </GlassCard>

            {/* Role Simulation */}
            <GlassCard className="p-6">
                <SectionHeader icon={Shield} iconColor="text-purple-500 bg-purple-500" title="Симуляция ролей"
                    subtitle="Временно переключите аккаунт на другую роль." />
                <div className="grid grid-cols-2 gap-2.5">
                    {Object.entries(ROLE_NAMES).filter(([k]) => k !== 'Гость').map(([rKey, rName]) => (
                        <button key={rKey} onClick={() => handleRoleSimulation(rKey)}
                            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border active:scale-95 flex items-center justify-center gap-1.5 ${
                                role === rKey
                                ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200 dark:ring-purple-900'
                                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                            }`}>
                            {role === rKey && <ToggleLeft className="w-3.5 h-3.5" />} {rName}
                        </button>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
}
