import { Link, X, Send, MessageCircle, Copy } from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard.js';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { displayFio } from '../../../utils/fioFormat';

export default function DriverInviteModal({ driver, onClose }) {
    const [copied, setCopied] = useState('');
    if (!driver) return null;

    const code = driver.invite_code;
    const tgBotLink = `https://t.me/viksstroy_bot?start=driver_${code}`;
    const webLink = `https://miniapp.viks22.ru/driver-invite/${code}`;
    const fio = displayFio(driver);

    const copyAll = () => {
        const msg = `🚜 Привет! Вот приглашение для привязки профиля водителя в «ВиКС».\n\nФИО: ${fio}\n\n✈️ Для Telegram бота:\n${tgBotLink}\n\n💬 Для мессенджера MAX:\nОтправьте боту команду:\n/join ${code}`;
        copyToClipboard(msg, 'all', setCopied);
        toast.success('Сообщение скопировано');
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative border border-gray-100 dark:border-gray-700">
                <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-2 dark:text-white flex items-center gap-2">
                    <Link className="w-6 h-6 text-cyan-500" /> Приглашение
                </h3>
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-400 mb-4 bg-cyan-50 dark:bg-cyan-900/20 p-3 rounded-xl border border-cyan-100 dark:border-cyan-800/30">{fio}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">Отправьте водителю — он привяжет к этому коду свой Telegram или MAX.</p>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                            <Send className="w-4 h-4" /> Для Telegram:
                        </label>
                        <button onClick={() => copyToClipboard(tgBotLink, 'tg', setCopied)} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                            {copied === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                        </button>
                    </div>
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                            <MessageCircle className="w-4 h-4" /> Для мессенджера MAX:
                        </label>
                        <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-medium shadow-sm flex items-center justify-center">
                            <code className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer hover:opacity-70 active:scale-95"
                                onClick={() => copyToClipboard(`/join ${code}`, 'max', setCopied)}>
                                {copied === 'max' ? '✅ Скопировано!' : `/join ${code}`}
                            </code>
                        </div>
                    </div>
                </div>

                <button onClick={copyAll} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] mb-3 flex justify-center items-center gap-2">
                    <Copy className="w-5 h-5" /> Скопировать всё сообщение
                </button>
                <button onClick={onClose} className="w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]">Готово</button>
            </div>
        </div>
    );
}
