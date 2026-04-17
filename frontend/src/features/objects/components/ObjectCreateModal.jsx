import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    X, MapPin, FileUp, AlertCircle, CheckCheck, Trash2,
    Search, Check, ClipboardList,
} from 'lucide-react';
import useEnterToSubmit from '../../../hooks/useEnterToSubmit';
import ModalPortal from '../../../components/ui/ModalPortal';

/**
 * ObjectCreateModal
 * - Regular creation: name + address + KP (required)
 * - Request approval: pre-filled from request, banner shown, KP required
 *
 * Props:
 *   onClose, onCreated
 *   requestData?: { id, name, address, requested_by_name } — if approving a request
 *   onRequestApproved?: (reqId) => void — callback after request approval
 */
export default function ObjectCreateModal({ onClose, onCreated, requestData, onRequestApproved }) {
    const tgId = localStorage.getItem('tg_id') || '0';
    const isRequestMode = !!requestData;

    const [newObj, setNewObj] = useState({
        name: requestData?.name || '',
        address: requestData?.address || '',
    });
    const [pdfParsing, setPdfParsing] = useState(false);
    const [pdfData, setPdfData] = useState(null);
    const [pdfStep, setPdfStep] = useState('upload'); // 'upload' | 'verify'

    // KP state
    const [kpCatalog, setKpCatalog] = useState([]);
    const [selectedKp, setSelectedKp] = useState([]);
    const [targetVolumes, setTargetVolumes] = useState({});
    const [kpSearch, setKpSearch] = useState('');
    const [showKpSection, setShowKpSection] = useState(isRequestMode);
    const [kpError, setKpError] = useState('');

    useEffect(() => {
        axios.get('/api/kp/catalog').then(res => setKpCatalog(res.data || [])).catch(() => {});
    }, []);

    const filteredKp = kpCatalog.filter(
        k => k.name.toLowerCase().includes(kpSearch.toLowerCase()) ||
             k.category.toLowerCase().includes(kpSearch.toLowerCase())
    );
    const kpByCategory = filteredKp.reduce((acc, curr) => {
        acc[curr.category] = acc[curr.category] || [];
        acc[curr.category].push(curr);
        return acc;
    }, {});

    const toggleKp = (id) => {
        setSelectedKp(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        setKpError('');
    };

    const reset = () => {
        setNewObj({ name: '', address: '' });
        setPdfData(null);
        setPdfStep('upload');
        setSelectedKp([]);
        setTargetVolumes({});
        setKpSearch('');
        setKpError('');
    };

    const handleClose = () => { reset(); onClose(); };

    useEnterToSubmit(true, () => handleCreate());

    const handleCreate = async (e) => {
        if (e) e.preventDefault();
        if (selectedKp.length === 0) {
            setKpError('Необходимо добавить СМР работы');
            setShowKpSection(true);
            return;
        }
        try {
            if (isRequestMode) {
                await axios.post(`/api/object_requests/${requestData.id}/review`, {
                    action: 'approve',
                    name: newObj.name,
                    address: newObj.address,
                    kp_ids: selectedKp,
                    target_volumes: targetVolumes,
                });
                toast.success('Объект создан по запросу!');
                if (onRequestApproved) onRequestApproved(requestData.id);
            } else {
                await axios.post('/api/objects/create', {
                    name: newObj.name,
                    address: newObj.address,
                    kp_ids: selectedKp,
                    target_volumes: targetVolumes,
                });
                toast.success('Объект успешно создан!');
            }
            reset();
            onClose();
            onCreated();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка создания');
        }
    };

    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPdfParsing(true);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await axios.post('/api/objects/parse_pdf', fd);
            setPdfData(res.data);
            setNewObj({ name: res.data.name || '', address: res.data.address || '' });
            setPdfStep('verify');

            // Auto-match PDF works to KP catalog
            if (res.data.works?.length && kpCatalog.length) {
                const matchedIds = [];
                const tvMap = {};
                for (const w of res.data.works) {
                    const match = kpCatalog.find(
                        k => k.name.toLowerCase().trim() === w.name.toLowerCase().trim()
                    );
                    if (match) {
                        matchedIds.push(match.id);
                        if (w.volume) tvMap[match.id] = w.volume;
                    }
                }
                if (matchedIds.length > 0) {
                    setSelectedKp(matchedIds);
                    setTargetVolumes(tvMap);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка парсинга PDF');
        }
        setPdfParsing(false);
        e.target.value = '';
    };

    const handlePdfWorkChange = (index, field, value) => {
        setPdfData(prev => {
            const works = [...prev.works];
            works[index] = { ...works[index], [field]: field === 'volume' ? (parseFloat(value) || 0) : value };
            return { ...prev, works };
        });
    };

    const handlePdfRemoveWork = (index) => {
        setPdfData(prev => ({ ...prev, works: prev.works.filter((_, i) => i !== index) }));
    };

    /* ───── KP selection section (reusable) ───── */
    const kpSection = (
        <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className={`block text-xs font-bold uppercase mb-0 ${kpError ? 'text-red-500' : 'text-gray-500'}`}>
                    План СМР (КП) <span className="text-red-500">*</span>
                </label>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Выбрано: {selectedKp.length}
                </span>
            </div>
            {kpError && (
                <p className="text-xs text-red-500 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {kpError}
                </p>
            )}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                    type="text"
                    value={kpSearch}
                    onChange={e => setKpSearch(e.target.value)}
                    placeholder="Поиск работ..."
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white text-sm"
                />
            </div>
            <div className={`space-y-3 max-h-[35vh] overflow-y-auto pr-1 scrollbar-thin rounded-xl border ${kpError ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-700'}`}>
                {Object.keys(kpByCategory).map(category => (
                    <div key={category}>
                        <div className="bg-gray-50 dark:bg-gray-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                            {category}
                        </div>
                        {kpByCategory[category].map(k => {
                            const isSelected = selectedKp.includes(k.id);
                            return (
                                <div
                                    key={k.id}
                                    onClick={() => toggleKp(k.id)}
                                    className={`px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                                >
                                    <div className={`w-4.5 h-4.5 flex-shrink-0 rounded border flex items-center justify-center ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                                        {isSelected && <Check className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold leading-tight truncate ${isSelected ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {k.name}
                                        </p>
                                        <p className="text-[11px] text-gray-400">{k.unit}</p>
                                    </div>
                                    {isSelected && (
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.1"
                                            placeholder="Объем"
                                            value={targetVolumes[k.id] || ''}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => {
                                                e.stopPropagation();
                                                setTargetVolumes(prev => ({ ...prev, [k.id]: parseFloat(e.target.value) || 0 }));
                                            }}
                                            className="w-20 px-2 py-1 text-xs border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white text-right"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
                {filteredKp.length === 0 && (
                    <p className="text-center text-gray-400 italic py-4 text-sm">Ничего не найдено</p>
                )}
            </div>
        </div>
    );

    return (
        <ModalPortal>
        <div className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative">
                <button
                    onClick={handleClose}
                    className="absolute top-5 right-5 text-gray-400 hover:text-red-500 bg-gray-50 dark:bg-gray-700 rounded-full p-1.5"
                >
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-4 dark:text-white flex items-center gap-2">
                    <MapPin className="text-blue-500" /> {isRequestMode ? 'Создание объекта' : 'Новый объект'}
                </h3>

                {/* Request banner */}
                {isRequestMode && (
                    <div className="mb-5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30 flex items-start gap-2">
                        <ClipboardList className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                                По запросу от {requestData.requested_by_name}
                            </p>
                            {requestData.comment && (
                                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">{requestData.comment}</p>
                            )}
                        </div>
                    </div>
                )}

                {pdfStep === 'upload' && (
                    <>
                        {/* PDF upload — only for non-request mode */}
                        {!isRequestMode && (
                            <>
                                <div className="mb-5 p-4 bg-violet-50/50 dark:bg-violet-900/10 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-700">
                                    <label className={`block w-full text-center py-5 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-colors ${pdfParsing ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                                        <FileUp className="w-10 h-10 text-violet-400 mx-auto mb-2" />
                                        <span className="text-sm font-bold text-violet-600 dark:text-violet-400 block">
                                            {pdfParsing ? 'Анализ PDF...' : 'Загрузить СМР из PDF'}
                                        </span>
                                        <span className="text-xs text-gray-400 mt-1 block">
                                            Автоматически заполнит название, адрес и работы
                                        </span>
                                    </label>
                                </div>
                                <div className="relative flex items-center justify-center mb-5">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                                    </div>
                                    <span className="relative bg-white dark:bg-gray-800 px-3 text-xs text-gray-400 font-bold uppercase">
                                        или заполните вручную
                                    </span>
                                </div>
                            </>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    Название <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newObj.name}
                                    onChange={e => setNewObj({ ...newObj, name: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    placeholder="Например: ЖК Счастье"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    Адрес
                                </label>
                                <input
                                    type="text"
                                    value={newObj.address}
                                    onChange={e => setNewObj({ ...newObj, address: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    placeholder="г. Москва, ул. Мира 10"
                                />
                            </div>

                            {/* Toggle KP section */}
                            {!showKpSection ? (
                                <button
                                    type="button"
                                    onClick={() => setShowKpSection(true)}
                                    className="w-full py-3 border-2 border-dashed border-emerald-200 dark:border-emerald-700 rounded-xl text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ClipboardList className="w-4 h-4" /> Добавить план СМР (КП) <span className="text-red-500">*</span>
                                </button>
                            ) : (
                                kpSection
                            )}

                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={!newObj.name}
                                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 transition-all mt-2"
                            >
                                {isRequestMode ? 'Одобрить и создать' : 'Создать объект'}
                            </button>
                        </div>
                    </>
                )}

                {pdfStep === 'verify' && pdfData && (
                    <div className="space-y-5">
                        {pdfData.errors?.length > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                                {pdfData.errors.map((err, i) => (
                                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {err}
                                    </p>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-100 dark:border-violet-800/30">
                            <CheckCheck className="w-5 h-5" /> Проверьте данные
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Название объекта</label>
                            <input type="text" value={newObj.name}
                                onChange={e => setNewObj({ ...newObj, name: e.target.value })}
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                placeholder="Название" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Адрес</label>
                            <input type="text" value={newObj.address}
                                onChange={e => setNewObj({ ...newObj, address: e.target.value })}
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                placeholder="Адрес" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                                Работы из PDF ({pdfData.works?.length || 0})
                            </label>
                            {pdfData.works?.length > 0 ? (
                                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                    <div className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        <span>Наименование</span><span>Ед.изм</span><span>Кол-во</span><span></span>
                                    </div>
                                    <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-[30vh] overflow-y-auto">
                                        {pdfData.works.map((w, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 items-center">
                                                <input type="text" value={w.name}
                                                    onChange={e => handlePdfWorkChange(i, 'name', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full" />
                                                <input type="text" value={w.unit}
                                                    onChange={e => handlePdfWorkChange(i, 'unit', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-center" />
                                                <input type="number" step="0.1" value={w.volume}
                                                    onChange={e => handlePdfWorkChange(i, 'volume', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-right" />
                                                <button onClick={() => handlePdfRemoveWork(i)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-gray-400 italic py-4 text-sm">Работы не найдены в PDF</p>
                            )}
                        </div>

                        {/* KP selection from catalog (auto-matched from PDF) */}
                        {kpSection}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => { setPdfStep('upload'); setPdfData(null); }}
                                className="flex-1 py-4 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Назад
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex-1 bg-violet-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-violet-700 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCheck className="w-5 h-5" /> Подтвердить и создать
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
        </ModalPortal>
    );
}
