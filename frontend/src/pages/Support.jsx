import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, Send, MessageCircle, Smartphone, Bot, Users, ArrowLeft, Clock, User } from 'lucide-react';
import axios from 'axios';
import { renderMarkdown } from '../utils/markdownLight';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fadeIn = prefersReducedMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

const ROLE_LABELS = {
    superadmin: 'Супер-Админ', boss: 'Руководитель', moderator: 'Модератор',
    foreman: 'Прораб', brigadier: 'Бригадир', worker: 'Рабочий', driver: 'Водитель', unknown: '—'
};

function TypingIndicator() {
    return (
        <div className="flex items-end gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700/60 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />
                <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" />
            </div>
        </div>
    );
}

function ChatMessage({ msg, index }) {
    const isUser = msg.from === 'user';
    return (
        <motion.div
            {...fadeIn}
            transition={{ duration: 0.2, delay: prefersReducedMotion ? 0 : Math.min(index * 0.03, 0.3) }}
            className={`flex ${isUser ? 'justify-end' : 'items-end gap-2'} mb-3`}
        >
            {!isUser && (
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
            )}
            <div className={`max-w-[80%] sm:max-w-[70%] px-4 py-2.5 text-sm leading-relaxed break-words ${
                isUser
                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-md shadow-sm whitespace-pre-wrap'
                    : 'bg-gray-100 dark:bg-gray-700/60 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md'
            }`}>
                {isUser ? msg.text : renderMarkdown(msg.text)}
            </div>
        </motion.div>
    );
}

/* ───── Dialog list sidebar for boss/superadmin ───── */
function DialogList({ dialogs, selected, onSelect, onMyChat, loading }) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }
    return (
        <div className="flex flex-col h-full">
            {/* "My chat" button */}
            <button
                onClick={onMyChat}
                className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    selected === 'my' ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500' : ''
                }`}
            >
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left min-w-0">
                    <p className="text-sm font-bold dark:text-white truncate">Мой чат</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ваш диалог с ИИ</p>
                </div>
            </button>

            {/* Divider */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Все обращения</p>
            </div>

            {/* Dialog list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {dialogs.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Обращений пока нет</p>
                )}
                {dialogs.map(d => (
                    <button
                        key={d.user_id}
                        onClick={() => onSelect(d)}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left ${
                            selected === d.user_id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500' : ''
                        }`}
                    >
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold dark:text-white truncate">{d.fio}</p>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{d.msg_count}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                                    {ROLE_LABELS[d.role] || d.role}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{d.last_text}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ───── Main component ───── */
export default function Support() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const role = localStorage.getItem('user_role') || '';
    const isBoss = role === 'superadmin' || role === 'boss';

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [supportLinks, setSupportLinks] = useState({ support_tg_link: '', support_max_link: '' });

    // Boss state
    const [dialogs, setDialogs] = useState([]);
    const [dialogsLoading, setDialogsLoading] = useState(false);
    const [viewMode, setViewMode] = useState('my'); // 'my' | user_id number
    const [viewUserFio, setViewUserFio] = useState('');
    const [showSidebar, setShowSidebar] = useState(true);

    const chatRef = useRef(null);
    const textareaRef = useRef(null);

    const isViewingOther = viewMode !== 'my';

    // Load own history + support links + dialogs (for boss)
    useEffect(() => {
        const promises = [
            axios.get(`/api/support/history?tg_id=${tgId}`).then(res => {
                if (viewMode === 'my') {
                    setMessages((res.data || []).map(m => ({ from: m.from, text: m.text })));
                }
            }).catch(() => {}),
            axios.get('/api/settings/support').then(res => {
                setSupportLinks(res.data || {});
            }).catch(() => {})
        ];
        if (isBoss) {
            setDialogsLoading(true);
            promises.push(
                axios.get(`/api/support/all_dialogs?tg_id=${tgId}`).then(res => {
                    setDialogs(res.data || []);
                }).catch(() => {}).finally(() => setDialogsLoading(false))
            );
        }
        Promise.all(promises).finally(() => setHistoryLoading(false));
    }, [tgId]);

    // Auto-scroll
    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [messages, loading]);

    const loadUserHistory = async (userId) => {
        setHistoryLoading(true);
        try {
            const res = await axios.get(`/api/support/user_history?tg_id=${tgId}&target_user_id=${userId}`);
            setMessages((res.data || []).map(m => ({ from: m.from, text: m.text })));
        } catch {
            setMessages([]);
        }
        setHistoryLoading(false);
    };

    const loadMyHistory = async () => {
        setHistoryLoading(true);
        try {
            const res = await axios.get(`/api/support/history?tg_id=${tgId}`);
            setMessages((res.data || []).map(m => ({ from: m.from, text: m.text })));
        } catch {
            setMessages([]);
        }
        setHistoryLoading(false);
    };

    const handleSelectDialog = (d) => {
        setViewMode(d.user_id);
        setViewUserFio(d.fio);
        setShowSidebar(false);
        loadUserHistory(d.user_id);
    };

    const handleMyChat = () => {
        setViewMode('my');
        setViewUserFio('');
        setShowSidebar(false);
        loadMyHistory();
    };

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading || isViewingOther) return;

        const userMsg = { from: 'user', text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        try {
            const res = await axios.post('/api/support/chat', {
                message: text,
                tg_id: parseInt(tgId),
                history: newMessages.slice(-10)
            });
            setMessages(prev => [...prev, { from: 'assistant', text: res.data.reply }]);
        } catch {
            setMessages(prev => [...prev, { from: 'assistant', text: 'Ошибка отправки. Попробуйте ещё раз.' }]);
        }
        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };

    const handleInput = (e) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    const hasTg = supportLinks.support_tg_link?.trim();
    const hasMax = supportLinks.support_max_link?.trim();
    const hasLinks = hasTg || hasMax;

    if (historyLoading && !isBoss) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-3 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    /* ───── Chat panel (shared between my chat and viewing) ───── */
    const chatPanel = (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-4 lg:pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
                {isBoss && (
                    <button onClick={() => setShowSidebar(true)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mr-1">
                        <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </button>
                )}
                <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    {isViewingOther
                        ? <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        : <Headphones className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    }
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-extrabold tracking-tight dark:text-white truncate">
                        {isViewingOther ? viewUserFio : 'Поддержка'}
                    </h1>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                        {isViewingOther ? 'Просмотр диалога' : 'ИИ-ассистент'}
                    </p>
                </div>
                {isViewingOther ? (
                    <span className="ml-auto text-[10px] px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-bold flex-shrink-0">
                        Только чтение
                    </span>
                ) : (
                    <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                        {hasTg && (
                            <a href={supportLinks.support_tg_link} target="_blank" rel="noopener noreferrer"
                               className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Telegram">
                                <Send className="w-3.5 h-3.5 text-blue-500" />
                            </a>
                        )}
                        {hasMax && (
                            <a href={supportLinks.support_max_link} target="_blank" rel="noopener noreferrer"
                               className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="MAX">
                                <MessageCircle className="w-3.5 h-3.5 text-purple-500" />
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Chat area */}
            <div ref={chatRef} className="flex-1 overflow-y-auto min-h-0 pb-2 px-4 pr-3 scrollbar-thin" data-tour="support-chat">
                {messages.length === 0 && !loading && !historyLoading && (
                    <motion.div {...fadeIn} className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mb-4">
                            <Bot className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                        </div>
                        {isViewingOther
                            ? <p className="text-sm text-gray-500 dark:text-gray-400">У этого пользователя нет сообщений.</p>
                            : <>
                                <p className="text-gray-800 dark:text-gray-200 font-bold mb-1">Привет! Я ИИ-ассистент ВИКС.</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Задайте вопрос о работе платформы.</p>
                            </>
                        }
                    </motion.div>
                )}
                {historyLoading && (
                    <div className="flex items-center justify-center h-32">
                        <div className="w-6 h-6 border-2 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                )}
                <AnimatePresence>
                    {messages.map((msg, i) => (
                        <ChatMessage key={i} msg={msg} index={i} />
                    ))}
                </AnimatePresence>
                {loading && <TypingIndicator />}
            </div>

            {/* Input area — hidden when viewing other's chat */}
            {!isViewingOther && (
                <div className="flex-shrink-0 px-4 pt-3 pb-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-end gap-2" data-tour="support-input">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Напишите сообщение..."
                            rows={1}
                            className="flex-1 resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                            style={{ maxHeight: 120 }}
                        />
                        <motion.button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className="flex-shrink-0 w-11 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm disabled:shadow-none"
                            whileTap={prefersReducedMotion ? {} : { scale: 0.93 }}
                        >
                            <Send className="w-4.5 h-4.5" />
                        </motion.button>
                    </div>
                </div>
            )}

            {/* Messenger links moved to header as icon buttons */}
        </div>
    );

    /* ───── Regular user: simple chat ───── */
    if (!isBoss) {
        return (
            <div className="flex flex-col h-[calc(100dvh-80px)] lg:h-[calc(100dvh-16px)]">
                {chatPanel}
            </div>
        );
    }

    /* ───── Boss/Superadmin: split layout ───── */
    return (
        <div className="flex h-[calc(100dvh-80px)] lg:h-[calc(100dvh-16px)]">
            {/* Sidebar — always visible on desktop, toggleable on mobile */}
            <div className={`${showSidebar ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900`}>
                <div className="flex items-center gap-3 px-4 pt-4 lg:pt-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center">
                        <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight dark:text-white">Поддержка</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Все диалоги</p>
                    </div>
                </div>
                <DialogList
                    dialogs={dialogs}
                    selected={viewMode === 'my' ? 'my' : viewMode}
                    onSelect={handleSelectDialog}
                    onMyChat={handleMyChat}
                    loading={dialogsLoading}
                />
            </div>

            {/* Chat panel */}
            <div className={`${showSidebar ? 'hidden' : 'flex'} lg:flex flex-col flex-1 min-w-0`}>
                {chatPanel}
            </div>
        </div>
    );
}
