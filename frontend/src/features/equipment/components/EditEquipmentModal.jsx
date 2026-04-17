import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useEnterToSubmit from '../../../hooks/useEnterToSubmit';

export default function EditEquipmentModal({ equipment, categories, onClose, onUpdate }) {
    const [form, setForm] = useState({
        name: equipment.name || '',
        category: equipment.category || '',
        driver_fio: equipment.driver_fio || '',
        license_plate: equipment.license_plate || '',
    });
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEnterToSubmit(!confirmDelete, () => handleSave());

    const handleSave = async () => {
        if (!form.name.trim() || !form.category.trim()) {
            return toast.error("Название и категория обязательны");
        }
        setSaving(true);
        try {
            await axios.put(`/api/equipment/${equipment.id}`, form);
            toast.success("Техника обновлена");
            onUpdate();
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.detail || "Ошибка сохранения");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            await axios.post(`/api/equipment/${equipment.id}/delete`);
            toast.success("Техника удалена");
            onUpdate();
            onClose();
        } catch (e) {
            toast.error("Ошибка удаления");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 99990 }} onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold dark:text-white">Редактирование техники</h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Название</label>
                        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full p-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Категория</label>
                        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full p-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors">
                            <option value="">-- Выберите категорию --</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ФИО водителя</label>
                        <input type="text" value={form.driver_fio} onChange={e => setForm({ ...form, driver_fio: e.target.value })} className="w-full p-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Госномер</label>
                        <input type="text" value={form.license_plate} onChange={e => setForm({ ...form, license_plate: e.target.value })} placeholder="А123БВ22" className="w-full p-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    {!confirmDelete ? (
                        <button onClick={() => setConfirmDelete(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50">
                            <Trash2 className="w-4 h-4" /> Удалить
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button onClick={handleDelete} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50">
                                Да, удалить
                            </button>
                            <button onClick={() => setConfirmDelete(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50">
                                Отмена
                            </button>
                        </div>
                    )}

                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50">
                        <Save className="w-4 h-4" /> Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
}
