import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, Send, MessageCircle, Smartphone, Bot } from 'lucide-react';
import axios from 'axios';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fadeIn = prefersReducedMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

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
            <div className={`max-w-[80%] sm:max-w-[70%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-md shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700/60 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md'
            }`}>
                {msg.text}
            </div>
        </motion.div>
    );
}

export default function Support() {
    const tgId = localStorage.getItem('tg_id') || '0';
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [supportLinks, setSupportLinks] = useState({ support_tg_link: '', support_max_link: '' });
    const chatRef = useRef(null);
    const textareaRef = useRef(null);

    // Load history + support links on mount
    useEffect(() => {
        Promise.all([
            axios.get(`/api/support/history?tg_id=${tgId}`).then(res => {
                setMessages((res.data || []).map(m => ({ from: m.from, text: m.text })));
            }).catch(() => {}),
            axios.get('/api/settings/support').then(res => {
                setSupportLinks(res.data || {});
            }).catch(() => {})
        ]).finally(() => setHistoryLoading(false));
    }, [tgId]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const sendMessage = async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg = { from: 'user', text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setLoading(true);

        // Reset textarea height
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
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleInput = (e) => {
        setInput(e.target.value);
        // Auto-resize textarea
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    };

    const hasTg = supportLinks.support_tg_link?.trim();
    const hasMax = supportLinks.support_max_link?.trim();
    const hasLinks = hasTg || hasMax;

    if (historyLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-3 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-80px)] lg:h-[calc(100dvh-16px)] px-4 pt-4 lg:pt-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight dark:text-white">Тех. поддержка</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ИИ-ассистент ВИКС</p>
                </div>
            </div>

            {/* Chat area */}
            <div ref={chatRef} className="flex-1 overflow-y-auto min-h-0 pb-2 pr-1 -mr-1 scrollbar-thin">
                {messages.length === 0 && !loading && (
                    <motion.div {...fadeIn} className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mb-4">
                            <Bot className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                        </div>
                        <p className="text-gray-800 dark:text-gray-200 font-bold mb-1">Привет! Я ИИ-ассистент ВИКС.</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Задайте вопрос о работе платформы.</p>
                    </motion.div>
                )}
                <AnimatePresence>
                    {messages.map((msg, i) => (
                        <ChatMessage key={i} msg={msg} index={i} />
                    ))}
                </AnimatePresence>
                {loading && <TypingIndicator />}
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 pt-3 pb-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-end gap-2">
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

            {/* Messenger links */}
            {hasLinks && (
                <div className="flex-shrink-0 pb-4 pt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 text-center">
                        Для связи с человеком перейдите в мессенджер:
                    </p>
                    <div className="flex justify-center gap-3">
                        {hasTg && (
                            <a
                                href={supportLinks.support_tg_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-bold border border-blue-100 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            >
                                <Send className="w-4 h-4" /> Telegram
                            </a>
                        )}
                        {hasMax && (
                            <a
                                href={supportLinks.support_max_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl text-sm font-bold border border-purple-100 dark:border-purple-800/50 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                            >
                                <Smartphone className="w-4 h-4" /> MAX
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
