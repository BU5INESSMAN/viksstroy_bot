import { Link, Send, MessageCircle, Copy, X } from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard.js';
import toast from 'react-hot-toast';

export default function TeamInviteModal({ inviteInfo, setInviteInfo, copiedLink, setCopiedLink }) {
    if (!inviteInfo) return null;

    const copyInviteMessage = () => {
        const code = inviteInfo.invite_code || inviteInfo.join_password;
        const message = `👋 Привет! Присоединяйся к нашей бригаде в системе «ВиКС».\n\n✈️ Ссылка для Telegram бота:\n${inviteInfo.tg_bot_link}\n\n💬 Для мессенджера MAX:\nОтправьте боту Расписания команду:\n/join ${code}`;
        copyToClipboard(message, 'all', setCopiedLink);
        toast.success('Полное сообщение скопировано в буфер обмена!');
    };

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[130] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative border border-gray-100 dark:border-gray-700">
                <button onClick={() => setInviteInfo(null)} className="absolute top-5 right-5 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-700/50 rounded-full p-1.5">
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-2xl font-bold mb-2 dark:text-white flex items-center gap-2">
                    <Link className="w-6 h-6 text-indigo-500" /> Приглашение
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium leading-relaxed">Скопируйте и отправьте ссылки рабочим, чтобы они смогли присоединиться к бригаде.</p>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                            <Send className="w-4 h-4" /> Для Telegram:
                        </label>
                        <button onClick={() => copyToClipboard(inviteInfo.tg_bot_link, 'tg', setCopiedLink)} className="w-full text-left px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm text-blue-600 dark:text-blue-400 active:scale-[0.98]">
                            {copiedLink === 'tg' ? '✅ Успешно скопировано!' : '🔗 Нажмите, чтобы скопировать'}
                        </button>
                    </div>
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                            <MessageCircle className="w-4 h-4" /> Для мессенджера MAX:
                        </label>
                        <div className="w-full text-center px-4 py-3.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50 font-medium shadow-sm flex items-center justify-center transition-colors">
                            <code
                                className="text-blue-600 dark:text-blue-400 font-bold text-lg cursor-pointer hover:opacity-70 active:scale-95"
                                onClick={() => copyToClipboard(`/join ${inviteInfo.invite_code || inviteInfo.join_password}`, 'max', setCopiedLink)}
                            >
                                {copiedLink === 'max' ? '✅ Скопировано!' : `/join ${inviteInfo.invite_code || inviteInfo.join_password}`}
                            </code>
                        </div>
                    </div>
                </div>

                <button onClick={copyInviteMessage} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] mb-3 flex justify-center items-center gap-2">
                    <Copy className="w-5 h-5" />
                    Скопировать всё сообщение
                </button>

                <button onClick={() => setInviteInfo(null)} className="w-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-[0.98]">Готово</button>
            </div>
        </div>
    );
}
