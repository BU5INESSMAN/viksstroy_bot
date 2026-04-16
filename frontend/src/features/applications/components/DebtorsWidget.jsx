import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, Bell, Loader2 } from 'lucide-react';
import ObjectDisplay from '../../../components/ui/ObjectDisplay';

/**
 * Displays the SMR-debtors card on the Home page.
 * Shows foremen who have un-filled SMR reports, grouped by foreman.
 *
 * @param {object}   props
 * @param {array}    props.debtors   - array of debtor groups from /api/system/debtors
 * @param {string}   props.tgId      - current user's Telegram ID
 */
export default function DebtorsWidget({ debtors, tgId }) {
    const [remindingForeman, setRemindingForeman] = useState(null);

    const totalDebtorSMR = debtors.reduce((sum, g) => sum + g.smrs.length, 0);

    const handleRemindSMR = async (group) => {
        setRemindingForeman(group.foreman_id);
        try {
            await axios.post('/api/system/remind_smr', {
                foreman_id: group.foreman_id,
                app_ids: group.smrs.map(s => s.app_id),
            });
            toast.success('Напоминание отправлено');
        } catch {
            toast.error('Ошибка отправки напоминания');
        } finally {
            setRemindingForeman(null);
        }
    };

    if (!debtors || debtors.length === 0) return null;

    return (
        <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-red-800 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Должники СМР
                    <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {totalDebtorSMR}
                    </span>
                </h3>
            </div>

            <div className="space-y-3">
                {debtors.map((group, i) => (
                    <div key={i} className="bg-white/60 dark:bg-gray-800/40 rounded-xl px-4 py-3">
                        <div className="flex justify-between items-center mb-1.5">
                            <p className="font-semibold text-red-700 dark:text-red-300 text-sm">
                                {group.foreman_name}
                            </p>
                            <button
                                onClick={() => handleRemindSMR(group)}
                                disabled={remindingForeman === group.foreman_id}
                                className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 px-2.5 py-1 rounded-lg border border-orange-200 dark:border-orange-800 transition-all disabled:opacity-50"
                            >
                                {remindingForeman === group.foreman_id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Bell className="w-3 h-3" />}
                                Напомнить
                            </button>
                        </div>

                        <div className="space-y-1 pl-2 border-l-2 border-red-200 dark:border-red-800">
                            {group.smrs.map((s, j) => {
                                const d = s.days_overdue || 0;
                                const daysLabel = d === 1 ? '1 день' : d >= 2 && d <= 4 ? `${d} дня` : `${d} дней`;
                                const daysColor = d >= 6 ? 'text-red-600 dark:text-red-400 font-bold' : d >= 3 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-yellow-600 dark:text-yellow-400 font-medium';
                                return (
                                    <div key={j} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-1.5 truncate mr-2">
                                            {s.status === 'completed' ? (
                                                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500" title="Завершён, СМР не заполнен" />
                                            ) : (
                                                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-yellow-400" title="В работе" />
                                            )}
                                            <ObjectDisplay
                                                variant="inline"
                                                showIcon={false}
                                                name={s.object_name || s.object_address}
                                                address={s.object_name ? s.object_address : ''}
                                                nameClassName="text-red-600/80 dark:text-red-400/80 truncate"
                                                addressClassName="text-red-400 dark:text-red-500/70 truncate"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {d > 0 && <span className={`text-[10px] ${daysColor}`}>{daysLabel}</span>}
                                            <span className="text-red-400 dark:text-red-500">{s.date_target}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
