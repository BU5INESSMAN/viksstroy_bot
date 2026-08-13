import { useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock3, Truck, Users, X } from 'lucide-react';
import { formatApplicationNumber } from '../../../utils/applicationNumber';
import ObjectDisplay from '../../../components/ui/ObjectDisplay';


const parseIds = (value) => String(value || '').split(',')
    .map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);

const parseEquipment = (value) => {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const formatDateRu = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU')
    : 'дата не указана';


export default function ForemanReleasePanel({ applications, teams, onReleased }) {
    const [open, setOpen] = useState(false);
    const [selectedAppId, setSelectedAppId] = useState(null);
    const [teamIds, setTeamIds] = useState([]);
    const [equipmentIds, setEquipmentIds] = useState([]);
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);

    const teamMap = useMemo(() => Object.fromEntries((teams || []).map((team) => [Number(team.id), team.name])), [teams]);
    const candidates = useMemo(() => (applications || []).map((app) => {
        const freedTeams = new Set(parseIds(app.freed_team_ids));
        const availableTeams = parseIds(app.team_id)
            .filter((id) => !freedTeams.has(id) && Number(app.is_team_freed) !== 1)
            .map((id) => ({ id, name: teamMap[id] || `Бригада #${id}` }));
        const availableEquipment = parseEquipment(app.equipment_data)
            .filter((item) => item?.id && !item.is_freed)
            .map((item) => ({ id: Number(item.id), name: item.name || `Техника #${item.id}` }));
        return { ...app, availableTeams, availableEquipment };
    }).filter((app) => app.availableTeams.length || app.availableEquipment.length), [applications, teamMap]);

    const selectedApp = candidates.find((app) => Number(app.id) === Number(selectedAppId)) || null;
    const count = teamIds.length + equipmentIds.length;

    const toggle = (setter, list, value) => setter(list.includes(value) ? list.filter((id) => id !== value) : [...list, value]);
    const close = () => {
        setOpen(false); setSelectedAppId(null); setTeamIds([]); setEquipmentIds([]); setConfirmation('');
    };
    const pickApp = (app) => {
        setSelectedAppId(app.id); setTeamIds([]); setEquipmentIds([]); setConfirmation('');
    };
    const selectAll = () => {
        setTeamIds(selectedApp?.availableTeams.map((item) => item.id) || []);
        setEquipmentIds(selectedApp?.availableEquipment.map((item) => item.id) || []);
    };
    const submit = async () => {
        if (!selectedApp || !count) return toast.error('Выберите ресурсы');
        setBusy(true);
        try {
            const form = new FormData();
            form.append('team_ids', teamIds.join(','));
            form.append('equipment_ids', equipmentIds.join(','));
            await axios.post(`/api/applications/${selectedApp.id}/release_resources`, form);
            toast.success(`Освобождено ресурсов: ${count}`);
            close();
            onReleased?.();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Не удалось освободить ресурсы');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <section className="rounded-3xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-gray-800 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm"><CheckCircle2 className="w-6 h-6" /></div>
                        <div className="min-w-0">
                            <h2 className="font-black text-gray-900 dark:text-white">Освободить ресурсы</h2>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Бригады и техника станут доступны для следующего объекта. Время работы сохранится до текущего момента.</p>
                        </div>
                    </div>
                    <button type="button" disabled={!candidates.length} onClick={() => setOpen(true)} className="min-h-12 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                        {candidates.length ? `Выбрать · ${candidates.length}` : 'Нет занятых ресурсов'}
                    </button>
                </div>
            </section>

            {open && (
                <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm p-4 flex items-start justify-center overflow-y-auto">
                    <div className="w-full max-w-xl mt-[max(1rem,env(safe-area-inset-top))] mb-24 rounded-3xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-5 border-b border-gray-100 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur">
                            <div><h3 className="font-black text-lg dark:text-white">Освобождение ресурсов</h3><p className="text-xs text-gray-500 mt-1">Выберите заявку, затем несколько бригад и единиц техники</p></div>
                            <button type="button" onClick={close} className="w-11 h-11 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700" aria-label="Закрыть"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="space-y-2">
                                {candidates.map((app) => (
                                    <button key={app.id} type="button" onClick={() => pickApp(app)} className={`w-full text-left p-4 rounded-2xl border transition ${Number(app.id) === Number(selectedAppId) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300'}`}>
                                        <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">{formatApplicationNumber(app)}</p>
                                        <ObjectDisplay name={app.object_name} address={app.object_address} nameClassName="font-bold text-sm text-gray-900 dark:text-white mt-1" addressClassName="text-xs text-gray-500 mt-0.5" />
                                        <p className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {formatDateRu(app.date_target)} · доступно: {app.availableTeams.length + app.availableEquipment.length}</p>
                                    </button>
                                ))}
                            </div>

                            {selectedApp && (
                                <>
                                    <div className="flex items-center justify-between gap-2"><h4 className="font-bold dark:text-white">Что освободить</h4><button type="button" onClick={selectAll} className="text-xs font-bold text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">Выбрать всё</button></div>
                                    {selectedApp.availableTeams.length > 0 && <div className="space-y-2"><p className="text-xs uppercase tracking-wider font-bold text-gray-400 flex items-center gap-1"><Users className="w-4 h-4" /> Бригады</p>{selectedApp.availableTeams.map((item) => <label key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/30 cursor-pointer"><input type="checkbox" checked={teamIds.includes(item.id)} onChange={() => toggle(setTeamIds, teamIds, item.id)} className="w-5 h-5 accent-emerald-600" /><span className="font-semibold text-sm dark:text-white">{item.name}</span></label>)}</div>}
                                    {selectedApp.availableEquipment.length > 0 && <div className="space-y-2"><p className="text-xs uppercase tracking-wider font-bold text-gray-400 flex items-center gap-1"><Truck className="w-4 h-4" /> Техника</p>{selectedApp.availableEquipment.map((item) => <label key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/30 cursor-pointer"><input type="checkbox" checked={equipmentIds.includes(item.id)} onChange={() => toggle(setEquipmentIds, equipmentIds, item.id)} className="w-5 h-5 accent-emerald-600" /><span className="font-semibold text-sm dark:text-white">{item.name}</span></label>)}</div>}
                                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-200"><b>Подтверждение:</b> выбранные ресурсы сразу станут свободными. Отработанное время считается от начала заявки до текущего момента.</div>
                                    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Введите ОСВОБОДИТЬ" className="w-full p-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white text-center uppercase font-black tracking-wider" />
                                    <button type="button" disabled={busy || !count || confirmation.trim().toLowerCase() !== 'освободить'} onClick={submit} className="w-full min-h-[3.25rem] py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Освобождаем…' : `Освободить выбранные (${count})`}</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
