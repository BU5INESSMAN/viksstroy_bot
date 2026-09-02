import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CalendarRange, Download, FileSpreadsheet, Info, Loader2, X } from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';

function isoLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function initialRange() {
    const now = new Date();
    return {
        from: isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
}

function filenameFromHeader(header) {
    const match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header || '');
    if (!match) return 'Сводный отчет СМР.xlsx';
    try { return decodeURIComponent(match[1].replace(/^"|"$/g, '')); }
    catch { return 'Сводный отчет СМР.xlsx'; }
}

export default function SMRPeriodReportModal({ onClose }) {
    const [initial] = useState(() => initialRange());
    const [dateFrom, setDateFrom] = useState(initial.from);
    const [dateTo, setDateTo] = useState(initial.to);
    const [includeUnaccounted, setIncludeUnaccounted] = useState(false);
    const [loading, setLoading] = useState(false);

    const download = async () => {
        if (!dateFrom || !dateTo) {
            toast.error('Выберите начало и окончание периода');
            return;
        }
        if (dateTo < dateFrom) {
            toast.error('Дата окончания не может быть раньше даты начала');
            return;
        }
        setLoading(true);
        try {
            const response = await axios.get('/api/kp/smr/period-report', {
                params: {
                    date_from: dateFrom,
                    date_to: dateTo,
                    include_unaccounted: includeUnaccounted,
                },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.download = filenameFromHeader(response.headers?.['content-disposition']);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);

            const employees = Number(response.headers?.['x-report-employees'] || 0);
            const objects = Number(response.headers?.['x-report-objects'] || 0);
            const withoutSalary = Number(response.headers?.['x-report-zero-salary-rows'] || 0);
            toast.success(`Отчёт сформирован: ${employees} сотрудников, ${objects} объектов`, { duration: 5000 });
            if (withoutSalary > 0) {
                toast(`В ${withoutSalary} строках есть часы, но ЗП участника равна 0`, {
                    icon: '⚠️',
                    duration: 7000,
                });
            }
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Не удалось сформировать отчёт');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
                <div className="min-h-[100dvh] flex items-start sm:items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="min-w-0">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Сводный отчёт СМР
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    ЗП и часы по сотрудникам и объектам
                                </p>
                            </div>
                            <button type="button" onClick={onClose} className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Закрыть">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="space-y-1.5">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Начало периода</span>
                                    <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Конец периода</span>
                                    <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full min-h-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500" />
                                </label>
                            </div>

                            <label className="min-h-12 flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeUnaccounted}
                                    onChange={(event) => setIncludeUnaccounted(event.target.checked)}
                                    className="w-5 h-5 rounded text-amber-600"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-amber-900 dark:text-amber-200">Включить неучтённые СМР</span>
                                    <span className="block text-xs text-amber-700 dark:text-amber-300 mt-0.5">По умолчанию отчёт содержит только учтённые. Архивные СМР включаются всегда.</span>
                                </span>
                            </label>

                            <div className="rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/20 p-4 flex items-start gap-3">
                                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs leading-5 text-blue-800 dark:text-blue-200">
                                    В файле три листа: общая сводка, детализация по заявкам и все работы. Отдельно показаны предложение прораба и внутренний расчёт по справочнику. Архивные СМР отбираются по дате выполнения работ.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/20">
                            <button type="button" onClick={download} disabled={loading} className="w-full min-h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                {loading ? 'Формируем отчёт…' : 'Скачать Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
