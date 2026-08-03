import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import ModalPortal from '../../../components/ui/ModalPortal';

export default function MemberEditModal({ member, onClose, onSaved }) {
    const [fio, setFio] = useState('');
    const [position, setPosition] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFio(member?.fio || '');
        setPosition(member?.position || '');
    }, [member]);

    if (!member) return null;

    const submit = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await axios.patch(`/api/teams/members/${member.id}`, { fio, position });
            toast.success('Карточка сотрудника обновлена');
            onSaved?.();
            onClose();
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Не удалось сохранить сотрудника');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
                <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-y-auto max-h-[calc(100dvh-2rem)]">
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white">Редактировать сотрудника</h3>
                        <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0" aria-label="Закрыть">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                    <div className="p-5 space-y-4">
                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                            ФИО
                            <input value={fio} onChange={(e) => setFio(e.target.value)} required className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-normal text-gray-900 dark:text-white" />
                        </label>
                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-300">
                            Должность
                            <input value={position} onChange={(e) => setPosition(e.target.value)} required className="mt-1.5 w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-normal text-gray-900 dark:text-white" />
                        </label>
                        <button disabled={saving || !fio.trim() || !position.trim()} className="w-full min-h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                            {saving ? 'Сохранение…' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalPortal>
    );
}
