import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    X, MapPin, FileUp, AlertCircle, CheckCheck, Trash2,
} from 'lucide-react';

export default function ObjectCreateModal({ onClose, onCreated }) {
    const [newObj, setNewObj] = useState({ name: '', address: '' });
    const [pdfParsing, setPdfParsing] = useState(false);
    const [pdfData, setPdfData] = useState(null); // { name, address, works, errors }
    const [pdfStep, setPdfStep] = useState('upload'); // 'upload' | 'verify'

    const reset = () => {
        setNewObj({ name: '', address: '' });
        setPdfData(null);
        setPdfStep('upload');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', newObj.name);
            fd.append('address', newObj.address);
            await axios.post('/api/objects/create', fd);
            reset();
            onClose();
            onCreated();
            toast.success('Объект успешно создан!');
        } catch (e) {
            toast.error('Ошибка создания');
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
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка парсинга PDF');
        }
        setPdfParsing(false);
        e.target.value = '';
    };

    const handlePdfWorkChange = (index, field, value) => {
        setPdfData(prev => {
            const works = [...prev.works];
            works[index] = {
                ...works[index],
                [field]: field === 'volume' ? (parseFloat(value) || 0) : value,
            };
            return { ...prev, works };
        });
    };

    const handlePdfRemoveWork = (index) => {
        setPdfData(prev => ({ ...prev, works: prev.works.filter((_, i) => i !== index) }));
    };

    const handlePdfConfirmAndCreate = async () => {
        if (!newObj.name || !newObj.address) {
            toast.error('Заполните название и адрес объекта');
            return;
        }
        try {
            const fd = new FormData();
            fd.append('name', newObj.name);
            fd.append('address', newObj.address);
            await axios.post('/api/objects/create', fd);

            const objRes = await axios.get('/api/objects?archived=0');
            const created = objRes.data.find(
                o => o.name === newObj.name && o.address === newObj.address
            );

            if (created && pdfData?.works?.length) {
                const kpRes = await axios.get('/api/kp/catalog');
                const catalog = kpRes.data || [];
                const matchedIds = [];
                const tvMap = {};

                for (const w of pdfData.works) {
                    const match = catalog.find(
                        k => k.name.toLowerCase().trim() === w.name.toLowerCase().trim()
                    );
                    if (match) {
                        matchedIds.push(match.id);
                        if (w.volume) tvMap[match.id] = w.volume;
                    }
                }

                if (matchedIds.length > 0) {
                    await axios.post(`/api/objects/${created.id}/kp/update`, {
                        kp_ids: matchedIds,
                        target_volumes: tvMap,
                    });
                }
            }

            reset();
            onClose();
            onCreated();
            toast.success('Объект успешно создан!');
        } catch (err) {
            toast.error('Ошибка создания объекта');
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[100] bg-black/60 flex items-start justify-center p-4 pt-10 pb-24 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative">
                <button
                    onClick={handleClose}
                    className="absolute top-5 right-5 text-gray-400 hover:text-red-500 bg-gray-50 dark:bg-gray-700 rounded-full p-1.5"
                >
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
                    <MapPin className="text-blue-500" /> Новый объект
                </h3>

                {pdfStep === 'upload' && (
                    <>
                        <div className="mb-6 p-4 bg-violet-50/50 dark:bg-violet-900/10 rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-700">
                            <label
                                className={`block w-full text-center py-6 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-colors ${pdfParsing ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfUpload}
                                    className="hidden"
                                />
                                <FileUp className="w-10 h-10 text-violet-400 mx-auto mb-2" />
                                <span className="text-sm font-bold text-violet-600 dark:text-violet-400 block">
                                    {pdfParsing ? 'Анализ PDF...' : 'Загрузить СМР из PDF'}
                                </span>
                                <span className="text-xs text-gray-400 mt-1 block">
                                    Автоматически заполнит название, адрес и работы
                                </span>
                            </label>
                        </div>

                        <div className="relative flex items-center justify-center mb-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                            </div>
                            <span className="relative bg-white dark:bg-gray-800 px-3 text-xs text-gray-400 font-bold uppercase">
                                или заполните вручную
                            </span>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    Название
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
                                    required
                                    value={newObj.address}
                                    onChange={e => setNewObj({ ...newObj, address: e.target.value })}
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                                    placeholder="г. Москва, ул. Мира 10"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-blue-700 transition-all mt-4"
                            >
                                Создать объект
                            </button>
                        </form>
                    </>
                )}

                {pdfStep === 'verify' && pdfData && (
                    <div className="space-y-5">
                        {pdfData.errors?.length > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                                {pdfData.errors.map((err, i) => (
                                    <p
                                        key={i}
                                        className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2"
                                    >
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {err}
                                    </p>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 p-3 rounded-xl border border-violet-100 dark:border-violet-800/30">
                            <CheckCheck className="w-5 h-5" /> Проверьте данные
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                Название объекта
                            </label>
                            <input
                                type="text"
                                value={newObj.name}
                                onChange={e => setNewObj({ ...newObj, name: e.target.value })}
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                placeholder="Название"
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
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                placeholder="Адрес"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                                Работы СМР ({pdfData.works?.length || 0})
                            </label>
                            {pdfData.works?.length > 0 ? (
                                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                                    <div className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        <span>Наименование</span>
                                        <span>Ед.изм</span>
                                        <span>Кол-во</span>
                                        <span></span>
                                    </div>
                                    <div className="divide-y divide-gray-50 dark:divide-gray-700 max-h-[40vh] overflow-y-auto">
                                        {pdfData.works.map((w, i) => (
                                            <div
                                                key={i}
                                                className="grid grid-cols-[1fr_70px_70px_32px] gap-2 px-3 py-2 items-center"
                                            >
                                                <input
                                                    type="text"
                                                    value={w.name}
                                                    onChange={e => handlePdfWorkChange(i, 'name', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full"
                                                />
                                                <input
                                                    type="text"
                                                    value={w.unit}
                                                    onChange={e => handlePdfWorkChange(i, 'unit', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-center"
                                                />
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={w.volume}
                                                    onChange={e => handlePdfWorkChange(i, 'volume', e.target.value)}
                                                    className="text-sm px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 dark:text-white w-full text-right"
                                                />
                                                <button
                                                    onClick={() => handlePdfRemoveWork(i)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-gray-400 italic py-4 text-sm">
                                    Работы не найдены в PDF
                                </p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => { setPdfStep('upload'); setPdfData(null); }}
                                className="flex-1 py-4 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Назад
                            </button>
                            <button
                                onClick={handlePdfConfirmAndCreate}
                                className="flex-1 bg-violet-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-violet-700 transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCheck className="w-5 h-5" /> Подтвердить и создать
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
