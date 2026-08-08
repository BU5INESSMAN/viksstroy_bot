import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart3, X, Users, Truck, UserCircle2 } from 'lucide-react';
import ModalPortal from '../ui/ModalPortal';

const CONFIG = {
    teams: { title: 'Статистика всех бригад', icon: Users, url: '/api/teams/stats/overview' },
    equipment: { title: 'Статистика автопарка', icon: Truck, url: '/api/equipment/stats/overview' },
    drivers: { title: 'Статистика водителей', icon: UserCircle2, url: '/api/drivers/stats/overview' },
};

function rowView(kind, row) {
    if (kind === 'teams') return {
        title: row.name,
        facts: [
            `${row.member_count || 0} участников`,
            `${row.assignments || 0} выездов`,
            `${row.partial_assignments || 0} частичных`,
            `${row.labor_hours || 0} ч СМР`,
        ],
        members: row.members || [],
    };
    if (kind === 'equipment') return {
        title: `${row.name || 'Техника'}${row.license_plate ? ` · ${row.license_plate}` : ''}`,
        facts: [
            row.category || 'Без категории',
            `${row.assignments || 0} назначений`,
            `${row.work_hours || 0} моточасов`,
            `${row.objects_count || 0} объектов`,
        ],
    };
    return {
        title: row.fio || `Водитель ${row.user_id}`,
        facts: [
            row.max_linked ? 'MAX привязан' : 'MAX не привязан',
            `${row.assignments || 0} назначений`,
            `${row.work_days || 0} рабочих дней`,
            `${row.equipment_count || 0} ед. техники`,
        ],
    };
}

export default function ResourceStatsModal({ kind, onClose }) {
    const [period, setPeriod] = useState('month');
    const [data, setData] = useState(undefined);
    const config = CONFIG[kind];

    useEffect(() => {
        if (!config) return;
        const controller = new AbortController();
        axios.get(`${config.url}?period=${period}`, { signal: controller.signal })
            .then((response) => setData(response.data || null))
            .catch((error) => { if (error?.code !== 'ERR_CANCELED') setData(null); });
        return () => controller.abort();
    }, [config, period]);

    if (!config) return null;
    const Icon = config.icon;
    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
                <div className="w-full max-w-2xl max-h-[88dvh] overflow-hidden rounded-3xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 dark:text-white truncate">{config.title}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Общие показатели и детализация по каждой записи</p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Закрыть статистику">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="flex gap-1 px-5 pt-4 overflow-x-auto">
                        {[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']].map(([value, label]) => (
                            <button key={value} type="button" onClick={() => { setData(undefined); setPeriod(value); }} className={`min-h-10 px-4 rounded-xl text-xs font-bold whitespace-nowrap ${period === value ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {data === undefined ? (
                            <div className="py-16 text-center text-sm text-gray-400">Собираем статистику…</div>
                        ) : !data ? (
                            <div className="py-16 text-center text-sm text-gray-400">Не удалось загрузить статистику</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    {(data.metrics || []).map((metric) => (
                                        <div key={metric.label} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
                                            <p className="text-2xl font-black text-gray-900 dark:text-white">{metric.value}</p>
                                            <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">{metric.label}</p>
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200"><BarChart3 className="w-4 h-4" /> Подробно</h4>
                                    <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                        {(data.rows || []).map((row) => {
                                            const view = rowView(kind, row);
                                            return (
                                                <div key={row.id || row.user_id} className="p-4 bg-white dark:bg-gray-800">
                                                    <p className="font-bold text-sm text-gray-900 dark:text-white break-words">{view.title}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {view.facts.map((fact) => <span key={fact} className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2 py-1 text-[11px] text-gray-600 dark:text-gray-300">{fact}</span>)}
                                                    </div>
                                                    {view.members?.length > 0 && (
                                                        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                                                            {view.members.map((member) => (
                                                                <div key={member.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 dark:bg-gray-900/30 px-3 py-2">
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">{member.fio}</p>
                                                                        <p className="truncate text-[10px] text-gray-400">{member.position || 'Должность не указана'} · {member.max_linked ? 'MAX' : 'без MAX'}</p>
                                                                    </div>
                                                                    <span className="whitespace-nowrap text-[11px] font-bold text-blue-600 dark:text-blue-400">{member.labor_hours || 0} ч</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {(data.rows || []).length === 0 && <p className="p-8 text-center text-sm text-gray-400">Нет данных</p>}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
