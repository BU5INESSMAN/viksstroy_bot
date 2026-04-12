import {
    Settings, Save, Mail, Rocket, Zap, ClipboardCheck,
    CheckCircle, Database, Bell, Lock, RefreshCw, Truck, Trash2
} from 'lucide-react';
import { GlassCard, SectionHeader, Toggle } from './UIHelpers';

export default function SystemSettings({ settings, handleSettingChange, saveSettings }) {
    return (
        <GlassCard className="p-6 sm:p-8">
            <SectionHeader icon={Settings} iconColor="text-blue-500 bg-blue-500" title="Настройки автоматизации" />
            <div className="space-y-5">

                {/* Auto-publish toggle + time */}
                <div className={`p-5 rounded-xl border transition-colors ${settings.auto_publish_enabled ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                <Rocket className={`w-4 h-4 ${settings.auto_publish_enabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} /> Авто-публикация заявок
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Одобренные заявки автоматически публикуются в беседу в указанное время.</p>
                        </div>
                        <Toggle name="auto_publish_enabled" checked={settings.auto_publish_enabled} onChange={handleSettingChange} />
                    </div>
                    {settings.auto_publish_enabled && (
                        <input type="time" name="auto_publish_time" value={settings.auto_publish_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-blue-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    )}
                </div>

                {/* Auto-start orders */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-amber-500" /> Авто-старт нарядов
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Все одобренные заявки на текущий день переводятся в статус "В работе".</p>
                    <input type="time" name="auto_start_orders_time" value={settings.auto_start_orders_time} onChange={handleSettingChange}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-amber-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                {/* Report request */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4 text-indigo-500" /> Запрос отчётов
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Бот запросит у прорабов заполнение табеля/отчёта по активным нарядам.</p>
                    <input type="time" name="report_request_time" value={settings.report_request_time} onChange={handleSettingChange}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                {/* Auto-complete */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-500" /> Авто-завершение нарядов
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Активные наряды переводятся в "Ожидает отчета".</p>
                    <input type="time" name="auto_complete_time" value={settings.auto_complete_time} onChange={handleSettingChange}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-emerald-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                {/* Foreman reminder */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                <Mail className="w-4 h-4 text-orange-500" /> Напоминание прорабам
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Бот напомнит прорабам заполнить заявки на следующий день.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Выходные</span>
                            <Toggle name="foreman_reminder_weekends" checked={settings.foreman_reminder_weekends} onChange={handleSettingChange} color="orange" />
                        </div>
                    </div>
                    <input type="time" name="foreman_reminder_time" value={settings.foreman_reminder_time} onChange={handleSettingChange}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-orange-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                {/* Auto-backup */}
                <div className={`p-5 rounded-xl border transition-colors ${settings.auto_backup_enabled ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                <Database className={`w-4 h-4 ${settings.auto_backup_enabled ? 'text-emerald-500' : 'text-gray-400'}`} /> Авто-бэкап базы данных
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Ежедневное автоматическое резервное копирование базы данных.</p>
                        </div>
                        <Toggle name="auto_backup_enabled" checked={settings.auto_backup_enabled} onChange={handleSettingChange} color="emerald" />
                    </div>
                </div>

                {/* Office reminders */}
                <div className={`p-5 rounded-xl border transition-colors ${settings.office_reminder_enabled ? 'bg-violet-50/50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-800/50' : 'bg-gray-50/80 dark:bg-gray-700/20 border-gray-100 dark:border-gray-700/50'}`}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                                <Bell className={`w-4 h-4 ${settings.office_reminder_enabled ? 'text-violet-500' : 'text-gray-400'}`} /> Напоминание офису
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Уведомит офис, если отчёты не проверены к указанному времени.</p>
                        </div>
                        <Toggle name="office_reminder_enabled" checked={settings.office_reminder_enabled} onChange={handleSettingChange} color="violet" />
                    </div>
                    {settings.office_reminder_enabled && (
                        <input type="time" name="office_reminder_time" value={settings.office_reminder_time} onChange={handleSettingChange}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-violet-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                    )}
                </div>

                {/* SMR unlock time */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-rose-500" /> Время открытия СМР
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Прорабы смогут заполнить отчёт СМР только после указанного времени (HH:MM).</p>
                    <input type="time" name="smr_unlock_time" value={settings.smr_unlock_time} onChange={handleSettingChange}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-rose-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                {/* Equipment settings */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-cyan-500" /> Настройки техники
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium">Базовое время работы техники и обмен.</p>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-widest">С</label>
                            <input type="time" name="equip_base_time_start" value={settings.equip_base_time_start} onChange={handleSettingChange}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-cyan-500 block w-full p-3 dark:text-white shadow-sm outline-none" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-widest">До</label>
                            <input type="time" name="equip_base_time_end" value={settings.equip_base_time_end} onChange={handleSettingChange}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-cyan-500 block w-full p-3 dark:text-white shadow-sm outline-none" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                <RefreshCw className={`w-3.5 h-3.5 ${settings.exchange_enabled ? 'text-cyan-500' : 'text-gray-400'}`} /> Обмен техники
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Прорабы смогут обмениваться техникой.</p>
                        </div>
                        <Toggle name="exchange_enabled" checked={settings.exchange_enabled} onChange={handleSettingChange} color="cyan" />
                    </div>
                </div>

                {/* Log retention */}
                <div className="bg-gray-50/80 dark:bg-gray-700/20 p-5 rounded-xl border border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4 text-red-500" /> Хранение логов (дней)
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 font-medium">Записи журнала действий старше указанного количества дней удаляются автоматически.</p>
                    <input type="number" name="log_retention_days" value={settings.log_retention_days} onChange={handleSettingChange}
                        min="7" max="365"
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 text-sm font-bold rounded-xl focus:ring-2 focus:ring-red-500 block w-full sm:w-1/2 p-3 dark:text-white shadow-sm outline-none" />
                </div>

                <button onClick={saveSettings}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl text-sm py-3.5 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                    <Save className="w-4 h-4" /> Сохранить настройки
                </button>
            </div>
        </GlassCard>
    );
}
