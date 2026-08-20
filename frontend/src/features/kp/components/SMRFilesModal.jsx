import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    AlertTriangle, Calendar, CheckCircle2, Download, FileSpreadsheet,
    HardHat, Loader2, MapPin, Users, X,
} from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';

function parseFilename(header, fallback) {
    if (!header) return fallback;
    const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
    if (encoded) {
        try { return decodeURIComponent(encoded[1].replace(/^"|"$/g, '')); } catch { /* use fallback */ }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
    return plain?.[1]?.trim() || fallback;
}

function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || '—');
}

function saveBlob(response, fallback) {
    const filename = parseFilename(response.headers?.['content-disposition'], fallback);
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export default function SMRFilesModal({ app, onClose }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        axios.get(`/api/kp/apps/${app.id}/smr/files`)
            .then((response) => { if (active) setInfo(response.data); })
            .catch((requestError) => {
                if (active) setError(requestError.response?.data?.detail || 'Не удалось загрузить информацию об отчёте');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [app.id]);

    const downloadFile = async (file, index, quiet = false) => {
        const response = await axios.get(file.download_url, { responseType: 'blob' });
        saveBlob(response, `СМР - ${file.team_name || `Бригада ${index + 1}`}.xlsx`);
        if (!quiet) toast.success(`Скачан файл: ${file.team_name}`);
    };

    const downloadOne = async (file, index) => {
        setDownloading(`file:${index}`);
        try {
            await downloadFile(file, index);
        } catch (requestError) {
            toast.error(requestError.response?.data?.detail || 'Не удалось скачать файл');
        } finally {
            setDownloading(null);
        }
    };

    const downloadAll = async () => {
        if (!info?.files?.length) return;
        setDownloading('all');
        let downloaded = 0;
        for (let index = 0; index < info.files.length; index += 1) {
            try {
                await downloadFile(info.files[index], index, true);
                downloaded += 1;
            } catch { /* continue with the remaining standalone files */ }
        }
        if (downloaded === info.files.length) toast.success(`Скачано файлов: ${downloaded}`);
        else if (downloaded) toast.success(`Скачано файлов: ${downloaded} из ${info.files.length}`);
        else toast.error('Не удалось скачать файлы');
        setDownloading(null);
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
                <div className="min-h-[100dvh] flex items-start sm:items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                            <div className="min-w-0">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Файлы СМР
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    {info?.application_number || 'Информация об отчёте'}
                                </p>
                            </div>
                            <button type="button" onClick={onClose} className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Закрыть">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar p-5 space-y-4">
                            {loading && (
                                <div className="py-12 flex flex-col items-center text-sm text-gray-400">
                                    <Loader2 className="w-7 h-7 animate-spin mb-3 text-emerald-500" /> Загружаем файлы…
                                </div>
                            )}
                            {!loading && error && (
                                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm flex gap-2">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {error}
                                </div>
                            )}
                            {!loading && info && (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                        <InfoLine icon={HardHat} label="Прораб" value={info.foreman_name || 'Не указан'} />
                                        <InfoLine icon={Calendar} label="Дата работ" value={(info.dates || []).map(formatDate).join(', ') || 'Не указана'} />
                                        <InfoLine icon={MapPin} label="Объекты" value={(info.objects || []).map((item) => item.name).join(', ') || 'Не указаны'} wide />
                                        <InfoLine icon={Users} label="Файлы" value={`${info.files?.length || 0} по бригадам`} />
                                        <div className={`rounded-2xl border p-3 flex items-center gap-2 ${info.is_complete ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
                                            {info.is_complete
                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                            <span className="font-bold text-xs text-gray-700 dark:text-gray-200">
                                                {info.is_complete ? 'Отчёт заполнен полностью' : 'Отчёт заполнен не полностью'}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Файлы отчёта</p>
                                        <div className="space-y-2">
                                            {(info.files || []).map((file, index) => (
                                                <div key={`${file.team_id}:${index}`} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/20 p-3 flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                                                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-bold text-sm text-gray-900 dark:text-white break-words">{file.team_name}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 break-words">Excel · {(file.objects || []).join(', ') || 'СМР'}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(downloading)}
                                                        onClick={() => downloadOne(file, index)}
                                                        className="w-11 h-11 flex-shrink-0 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-blue-600 dark:text-blue-400 flex items-center justify-center disabled:opacity-50"
                                                        title={`Скачать ${file.team_name}`}
                                                    >
                                                        {downloading === `file:${index}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {!loading && info?.files?.length > 0 && (
                            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/20">
                                <button
                                    type="button"
                                    onClick={downloadAll}
                                    disabled={Boolean(downloading)}
                                    className="w-full min-h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {downloading === 'all' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                    Скачать все файлы ({info.files.length})
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}

function InfoLine({ icon: _Icon, label, value, wide = false }) {
    return (
        <div className={`rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 p-3 flex items-start gap-2 ${wide ? 'sm:col-span-2' : ''}`}>
            <_Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 break-words mt-0.5">{value}</p>
            </div>
        </div>
    );
}
