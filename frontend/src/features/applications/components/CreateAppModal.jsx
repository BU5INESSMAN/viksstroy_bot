import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar, MapPin, Users, Truck, MessageSquare,
    ClipboardList, Clock, CheckCircle,
    User, HardHat, X, Check, XCircle, ChevronDown, Search, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import ExchangeDialog from './ExchangeDialog';

function ObjectSelector({ objects, selectedId, disabled, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = objects.filter(o => {
        const q = search.toLowerCase();
        return (o.name || '').toLowerCase().includes(q) || (o.address || '').toLowerCase().includes(q);
    });

    const selected = objects.find(o => o.id === parseInt(selectedId));

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl font-bold text-left text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between gap-2"
            >
                <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>
                    {selected ? `${selected.name} ${selected.address ? `(${selected.address})` : ''}` : '-- Выберите объект из списка --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-2xl max-h-64 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600">
                            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Поиск объекта..."
                                className="w-full bg-transparent outline-none text-sm font-medium dark:text-white placeholder-gray-400"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                        {filtered.length === 0 ? (
                            <p className="text-sm text-gray-400 italic text-center py-4">Не найдено</p>
                        ) : (
                            filtered.map(obj => (
                                <button
                                    key={obj.id}
                                    type="button"
                                    onClick={() => { onSelect(obj.id); setIsOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                                        parseInt(selectedId) === obj.id
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <MapPin className={`w-4 h-4 flex-shrink-0 ${parseInt(selectedId) === obj.id ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <span className="truncate">{obj.name} {obj.address ? `(${obj.address})` : ''}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CreateAppModal({
    appForm, setAppForm, isSubmitting, setGlobalCreateAppOpen,
    handleCreateApp, handleDeleteApp, handleFormChange, handleApplyDefaults,
    handleObjectSelect,
    smartDates, objectsList, data, role,
    toggleTeamSelection, toggleAppMember, checkTeamStatus, checkEquipStatus,
    toggleEquipmentSelection, updateEquipmentTime,
    activeEqCategory, setActiveEqCategory, teamMembers, openProfile, openFreeModal,
    tgId
}) {
    const [exchangeDialog, setExchangeDialog] = useState(null);

    const handleEquipClick = async (e, st) => {
        if (st.state === 'repair') return toast.error(st.message);
        if (st.state === 'busy') {
            if (!appForm.date_target) return toast.error(st.message);
            try {
                const res = await axios.get(`/api/exchange/check_equip/${e.id}?date=${appForm.date_target}`);
                const info = res.data;
                if (info.can_exchange) {
                    setExchangeDialog({
                        equipId: e.id,
                        equipName: e.driver ? `${e.name} (${e.driver})` : e.name,
                        equipCategory: e.category,
                        holderName: info.holder_name,
                        holderObject: info.holder_object,
                        holderAppStatus: info.holder_app_status,
                        holderAppId: info.holder_app_id,
                    });
                } else if (info.is_in_pending_exchange) {
                    toast.error('Эта техника уже участвует в обмене');
                } else {
                    toast.error(st.message);
                }
            } catch {
                toast.error(st.message);
            }
            return;
        }
        toggleEquipmentSelection(e);
    };

    const dateChips = [
        { label: 'Сегодня', val: smartDates[0].val },
        { label: 'Завтра', val: smartDates[1].val },
        { label: 'Послезавтра', val: smartDates[2].val },
    ];

    return (
        <div className="!fixed !inset-0 !top-0 !left-0 !w-screen !h-[100dvh] z-[99990] bg-black/50 m-0 p-0 overflow-y-auto">
            <div className="flex min-h-screen items-start justify-center p-4 pt-10 pb-24">
                <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl relative transition-colors overflow-hidden">

                    {/* Экран загрузки поверх модалки */}
                    {isSubmitting && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="font-bold text-blue-700 dark:text-blue-400">⏳ Выполняется...</p>
                        </div>
                    )}

                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                        <h3 className="text-xl font-bold flex items-center gap-2 dark:text-white">
                            <ClipboardList className="text-blue-500 w-6 h-6" />
                            {appForm.id ? `Наряд №${appForm.id}` : 'Создание заявки'}
                        </h3>
                        <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors bg-white dark:bg-gray-800 rounded-full p-1.5 shadow-sm border border-gray-100 dark:border-gray-700">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleCreateApp} className="p-6 space-y-6 text-sm">
                        <div className="space-y-5">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <Calendar className="w-4 h-4" /> Дата выезда
                                </label>
                                {appForm.isViewOnly ? (
                                    <div className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-xl font-bold text-gray-800 dark:text-gray-100">
                                        {appForm.date_target}
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            {dateChips.map(chip => {
                                                const active = chip.val === appForm.date_target;
                                                return (
                                                    <button key={chip.val} type="button" disabled={isSubmitting}
                                                        onClick={() => handleFormChange('date_target', chip.val)}
                                                        className={`py-2.5 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 active:scale-95 ${active ? 'bg-blue-600 text-white border-blue-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                        {chip.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <input type="date" required value={appForm.date_target}
                                            disabled={isSubmitting}
                                            onChange={e => handleFormChange('date_target', e.target.value)}
                                            className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none font-bold text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                                    </>
                                )}
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                    <MapPin className="w-4 h-4 text-red-500" /> Объект
                                </label>
                                {appForm.isViewOnly ? (
                                    <div className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-xl font-bold text-gray-900 dark:text-white">
                                        {appForm.object_address || 'Объект не выбран'}
                                    </div>
                                ) : (
                                    <ObjectSelector
                                        objects={objectsList}
                                        selectedId={appForm.object_id}
                                        disabled={appForm.isViewOnly || isSubmitting}
                                        onSelect={(id) => handleObjectSelect ? handleObjectSelect(id) : (() => {
                                            const selObj = objectsList.find(o => o.id === parseInt(id));
                                            setAppForm({...appForm, object_id: id, object_address: selObj ? `${selObj.name} (${selObj.address})` : ''});
                                        })()}
                                    />
                                )}

                                {!appForm.isViewOnly && appForm.object_id && (
                                    <div className="flex gap-2 mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                        <button type="button" onClick={() => handleApplyDefaults('teams')} className="flex-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700/50 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" /> Бригады по умолчанию
                                        </button>
                                        <button type="button" onClick={() => handleApplyDefaults('equip')} className="flex-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700/50 py-2 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shadow-sm flex items-center justify-center gap-1.5">
                                            <Truck className="w-3.5 h-3.5" /> Техника по умолчанию
                                        </button>
                                    </div>
                                )}

                                {appForm.id && appForm.foreman_name && (
                                    <div className="mt-5 flex items-center p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600/50 shadow-sm">
                                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-full mr-4 text-blue-600 dark:text-blue-400">
                                            <HardHat className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-0.5">Прораб (Создатель)</p>
                                            {appForm.foreman_id ? (
                                                <button type="button" onClick={() => { setGlobalCreateAppOpen(false); openProfile(appForm.foreman_id); }} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline text-left transition-colors">
                                                    {appForm.foreman_name}
                                                </button>
                                            ) : (
                                                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{appForm.foreman_name}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Users className="w-4 h-4" /> {appForm.isViewOnly ? 'Состав бригад' : 'Выбор Бригад'}
                            </label>

                            {appForm.isViewOnly ? (
                                <div className="flex flex-col gap-4">
                                    {appForm.team_ids && appForm.team_ids.length > 0 ? (
                                        appForm.team_ids.map(teamId => {
                                            const tMembers = appForm.members_data?.filter(m => m.team_id === teamId) || [];
                                            const tName = tMembers.length > 0 ? tMembers[0].team_name : (data.teams?.find(t => t.id === teamId)?.name || `Бригада`);
                                            const isThisFreed = appForm.freed_team_ids?.includes(teamId) || appForm.is_team_freed === 1;

                                            return (
                                                <div key={teamId} className="p-4 bg-gray-50/80 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-2xl shadow-sm">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <h4 className={`font-bold flex items-center gap-2 ${isThisFreed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                                                            <div className={`p-1.5 rounded-lg ${isThisFreed ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'}`}>
                                                                <Users className="w-4 h-4" />
                                                            </div>
                                                            {tName}
                                                        </h4>
                                                        {isThisFreed && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-md flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Свободна</span>}
                                                    </div>

                                                    {tMembers.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2.5">
                                                            {tMembers.map(m => (
                                                                <button
                                                                    type="button"
                                                                    key={m.id}
                                                                    disabled={isSubmitting}
                                                                    onClick={() => { setGlobalCreateAppOpen(false); openProfile(m.tg_user_id, 'member', m.id); }}
                                                                    className="px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold border border-gray-200 dark:border-gray-700 rounded-xl text-xs transition-all flex items-center gap-2 shadow-sm active:scale-95 hover:shadow-md"
                                                                >
                                                                    <User className="w-3.5 h-3.5 text-gray-400" /> {m.fio}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : <p className="text-xs text-gray-500 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">Нет выбранных рабочих</p>}

                                                    {!isThisFreed && ['foreman', 'boss', 'superadmin', 'moderator'].includes(role) && (appForm.status === 'published' || appForm.status === 'in_progress') && (
                                                        <button type="button" disabled={isSubmitting} onClick={() => openFreeModal('specific_team', { app: appForm, teamId })} className="mt-5 w-full text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 py-3.5 rounded-xl transition-all border border-emerald-200 dark:border-emerald-800/50 flex justify-center items-center gap-2 shadow-sm active:scale-[0.98]">
                                                            <CheckCircle className="w-4 h-4" /> Освободить эту бригаду
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                                            <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                            <p className="font-medium text-gray-600 dark:text-gray-300">Только техника (люди не требуются)</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2.5">
                                    <button type="button" disabled={isSubmitting} onClick={() => handleFormChange('team_ids', [])} className={`px-4 py-2.5 text-sm disabled:opacity-50 font-bold rounded-xl border transition-all active:scale-95 flex items-center gap-2 ${appForm.team_ids.length === 0 ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400 shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}>
                                        <XCircle className="w-4 h-4" /> Без бригады
                                    </button>
                                    {data?.teams?.map(t => {
                                        const st = checkTeamStatus(t.id);
                                        const isSelected = appForm.team_ids.includes(t.id);
                                        let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700';
                                        let icon = <Users className="w-4 h-4 text-gray-400" />;

                                        if (st.state === 'busy') {
                                            btnStyles = 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-500 cursor-not-allowed opacity-75';
                                            icon = <Clock className="w-4 h-4" />;
                                        } else if (isSelected) {
                                            btnStyles = 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-500';
                                            icon = <CheckCircle className="w-4 h-4" />;
                                        }

                                        return (
                                            <button key={t.id} type="button" disabled={isSubmitting} onClick={() => { if(st.state !== 'free') return toast.error(st.message); toggleTeamSelection(t.id); }} className={`px-4 py-2.5 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                                                {icon} {t.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!appForm.isViewOnly && teamMembers?.length > 0 && (
                                <div className="mt-5 p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-4 uppercase tracking-wider">
                                        <User className="w-4 h-4" /> Выберите людей:
                                    </label>
                                    <div className="flex flex-wrap gap-2.5">
                                        {teamMembers.map(m => {
                                            const isSelected = appForm?.members?.includes(m.id);
                                            return (
                                                <button key={m.id} type="button" disabled={isSubmitting} onClick={() => toggleAppMember(m.id)} className={`px-3.5 py-2 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 hover:shadow-md ${isSelected ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                                    {isSelected ? <Check className="w-4 h-4" /> : <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>}
                                                    {m.fio}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div className="space-y-4">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                <Truck className="w-4 h-4" /> Требуемая техника
                            </label>

                            {!appForm.isViewOnly && (
                                <div className="flex flex-wrap gap-2.5 mb-3">
                                    {data?.equip_categories?.map(cat => (
                                        <button key={cat} type="button" disabled={isSubmitting} onClick={() => setActiveEqCategory(activeEqCategory === cat ? null : cat)} className={`px-4 py-2.5 disabled:opacity-50 text-xs font-bold rounded-xl border transition-all active:scale-95 ${activeEqCategory === cat ? 'bg-blue-500 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {activeEqCategory && !appForm.isViewOnly && (
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                                    <div className="flex flex-wrap gap-2.5">
                                        {data.equipment?.filter(e => e.category === activeEqCategory).map(e => {
                                            const st = checkEquipStatus(e);
                                            const isSelected = appForm.equipment.some(eq => eq.id === e.id);
                                            const displayName = e.driver ? `${e.name} (${e.driver})` : e.name;
                                            let btnStyles = 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700';

                                            if (st.state === 'repair') btnStyles = 'bg-red-50 border-red-200 text-red-500 cursor-not-allowed opacity-75 dark:bg-red-900/20 dark:border-red-800';
                                            else if (st.state === 'busy') btnStyles = 'bg-yellow-50 border-yellow-200 text-yellow-600 cursor-not-allowed opacity-80 dark:bg-yellow-900/20 dark:border-yellow-800';
                                            else if (isSelected) btnStyles = 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm ring-1 ring-blue-500';

                                            return (
                                                <button key={e.id} type="button" disabled={isSubmitting} onClick={() => handleEquipClick(e, st)} className={`px-3.5 py-2 disabled:opacity-50 text-sm font-bold rounded-xl border transition-all flex items-center gap-2 active:scale-95 ${btnStyles}`}>
                                                    {isSelected ? <CheckCircle className="w-4 h-4" /> : (st.state === 'repair' ? <XCircle className="w-4 h-4" /> : (st.state === 'busy' ? <Clock className="w-4 h-4" /> : <div className="w-4 h-4 border-2 border-current rounded-full opacity-30"></div>))}
                                                    {displayName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {appForm.equipment.length > 0 ? (
                                <div className="mt-5 space-y-3.5 p-5 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/30 shadow-inner">
                                    <label className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider border-b border-blue-200 dark:border-blue-800/50 pb-3 mb-4">
                                        <ClipboardList className="w-4 h-4" /> Список машин:
                                    </label>
                                    {appForm.equipment.map(eq => (
                                        <div key={eq.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-blue-100 dark:border-blue-700/50 shadow-sm gap-4 hover:shadow-md transition-shadow">
                                            {appForm.isViewOnly ? (
                                                <button type="button" disabled={isSubmitting} onClick={() => { setGlobalCreateAppOpen(false); openProfile(0, 'equip', eq.id); }} className={`font-bold text-sm text-left hover:underline disabled:opacity-50 flex items-center gap-2 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                    <div className={`p-1.5 rounded-lg ${eq.is_freed ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'}`}>
                                                        <Truck className="w-4 h-4" />
                                                    </div>
                                                    {eq.name.split('(')[0].trim()}
                                                    {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                                                </button>
                                            ) : (
                                                <p className={`font-bold text-sm flex items-center gap-2 ${eq.is_freed ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                                                    <Truck className={`w-5 h-5 ${eq.is_freed ? 'text-gray-400' : 'text-blue-500'}`} />
                                                    {eq.name}
                                                    {eq.is_freed && <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                                                <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                                                    <span className="bg-gray-50 dark:bg-gray-700 px-2.5 py-2 text-[10px] font-extrabold text-gray-500 border-r border-gray-200 dark:border-gray-600">С</span>
                                                    <input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_start} onChange={e => updateEquipmentTime(eq.id, 'time_start', e.target.value)} className="w-12 text-center py-2 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                                <span className="text-gray-400 font-bold px-1">—</span>
                                                <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                                                    <span className="bg-gray-50 dark:bg-gray-700 px-2 py-2 text-[10px] font-extrabold text-gray-500 border-r border-gray-200 dark:border-gray-600">ДО</span>
                                                    <input type="number" min="0" max="23" disabled={appForm.isViewOnly || isSubmitting} value={eq.time_end} onChange={e => updateEquipmentTime(eq.id, 'time_end', e.target.value)} className="w-12 text-center py-2 text-sm font-bold outline-none dark:bg-gray-800 dark:text-white disabled:opacity-80 bg-transparent" />
                                                    <span className="pr-2 font-bold text-gray-400 text-sm">:00</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                appForm.isViewOnly && (
                                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-2xl border border-gray-200 dark:border-gray-600 border-dashed text-center">
                                        <Truck className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                        <p className="font-medium text-gray-600 dark:text-gray-300">Техника не требуется</p>
                                    </div>
                                )
                            )}
                        </div>

                        <hr className="border-gray-100 dark:border-gray-700/80" />

                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                                <MessageSquare className="w-4 h-4" /> Комментарий
                            </label>
                            <input type="text" disabled={appForm.isViewOnly || isSubmitting} value={appForm.comment} onChange={e => handleFormChange('comment', e.target.value)} placeholder="Доп. информация..." className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl outline-none dark:text-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-80 transition-colors" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-6">
                            <button type="button" disabled={isSubmitting} onClick={() => setGlobalCreateAppOpen(false)} className="bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 py-4 px-6 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-all shadow-sm active:scale-95 flex-1">
                                Закрыть
                            </button>

                            {appForm.isViewOnly && appForm.id && ['superadmin', 'boss', 'moderator'].includes(role) && (
                                <button type="button" title="Удалить заявку" disabled={isSubmitting} onClick={handleDeleteApp} className="bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 py-4 px-6 rounded-xl font-bold transition-all flex-none border border-red-200 dark:border-red-800 flex justify-center items-center shadow-sm active:scale-95">
                                    {isSubmitting ? '⏳' : <XCircle className="w-5 h-5" />}
                                </button>
                            )}

                            {appForm.isViewOnly && appForm.status === 'waiting' && (
                                ['moderator', 'boss', 'superadmin'].includes(role) ||
                                (role === 'foreman' && String(appForm.foreman_id) === String(localStorage.getItem('tg_id') || '0'))
                            ) && (
                                <button type="button" disabled={isSubmitting} onClick={() => setAppForm(prev => ({...prev, isViewOnly: false}))} className="bg-yellow-500 text-white py-4 px-6 rounded-xl font-bold disabled:opacity-50 shadow-md hover:shadow-lg hover:bg-yellow-600 transition-all active:scale-[0.98] flex-1 flex justify-center items-center gap-2">
                                    Редактировать
                                </button>
                            )}

                            {!appForm.isViewOnly && (
                                <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white py-4 px-6 rounded-xl font-bold shadow-md hover:shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex-[2] flex justify-center items-center gap-2">
                                    {isSubmitting ? '⏳ Обработка...' : (appForm.id ? 'Сохранить изменения' : '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c')}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
            {exchangeDialog && createPortal(
                <ExchangeDialog
                    info={exchangeDialog}
                    equipment={data.equipment || []}
                    appEquipment={appForm.equipment}
                    appId={appForm.id}
                    tgId={tgId}
                    dateTarget={appForm.date_target}
                    onClose={() => setExchangeDialog(null)}
                />,
                document.body
            )}
        </div>
    );
}
