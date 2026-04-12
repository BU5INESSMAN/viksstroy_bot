import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { X, MessageSquarePlus, Send } from 'lucide-react';

export default function ObjectRequestModal({ onClose, onSubmitted, tgId }) {
    const [requestForm, setRequestForm] = useState({ name: '', address: '', comment: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', requestForm.name);
            fd.append('address', requestForm.address);
            fd.append('comment', requestForm.comment);
            fd.append('tg_id', tgId);
            await axios.post('/api/object_requests/create', fd);
            toast.success('Запрос на объект отправлен!');
            onSubmitted();
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Ошибка отправки запроса');
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[99990] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 text-gray-400 hover:text-red-500 bg-gray-50 dark:bg-gray-700 rounded-full p-1.5"
                >
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-6 dark:text-white flex items-center gap-2">
                    <MessageSquarePlus className="text-emerald-500" /> Запросить объект
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Название объекта
                        </label>
                        <input
                            type="text"
                            required
                            value={requestForm.name}
                            onChange={e => setRequestForm({ ...requestForm, name: e.target.value })}
                            className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                            placeholder="Например: ЖК Новый"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Адрес
                        </label>
                        <input
                            type="text"
                            value={requestForm.address}
                            onChange={e => setRequestForm({ ...requestForm, address: e.target.value })}
                            className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                            placeholder="г. Барнаул, ул. ..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                            Комментарий
                        </label>
                        <textarea
                            value={requestForm.comment}
                            onChange={e => setRequestForm({ ...requestForm, comment: e.target.value })}
                            rows={3}
                            className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white resize-none"
                            placeholder="Дополнительная информация..."
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                        <Send className="w-4 h-4" /> Отправить запрос
                    </button>
                </form>
            </div>
        </div>
    );
}
