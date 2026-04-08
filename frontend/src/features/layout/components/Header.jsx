import { useNavigate } from 'react-router-dom';
import {
    Sun, Moon, Monitor, BookOpen, Rocket, MessageCircle,
    X, ShieldCheck
} from 'lucide-react';

const roleNames = { 'superadmin': 'Супер-Админ', 'boss': 'Руководитель', 'moderator': 'Модератор', 'foreman': 'Прораб', 'worker': 'Рабочий', 'driver': 'Водитель', 'Гость': 'Гость' };

export default function Header({ isTMA, realRole, role, theme, toggleTheme, isMenuOpen, setIsMenuOpen }) {
    const navigate = useNavigate();
    const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

    const endRoleTest = () => {
        localStorage.setItem('user_role', realRole);
        localStorage.removeItem('real_role');
        window.location.reload();
    };

    return (
        <header className={`bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700/80 mb-6 ${isTMA ? 'pt-16' : 'pt-4'}`}>
            {realRole && (
                <div className="bg-purple-600 text-white text-center py-2.5 font-bold flex justify-center items-center space-x-4 relative z-50 shadow-sm text-sm">
                    <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Тест роли: {roleNames[role]}</span>
                    <button onClick={endRoleTest} className="bg-white/20 px-4 py-1.5 rounded-lg text-xs transition-colors active:scale-95">Вернуться</button>
                </div>
            )}
            <nav className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center relative max-w-7xl mx-auto">
                <div className="flex-1 flex items-center">
                    <div className="w-32 h-9 bg-blue-600 dark:bg-blue-500 transition-colors" style={{
                        WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                        WebkitMaskSize: 'contain', maskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'left center', maskPosition: 'left center'
                    }}></div>
                </div>

                <div className="relative flex items-center">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`flex items-center justify-center w-11 h-11 rounded-xl transition-all active:scale-95 ${isMenuOpen ? 'bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        {isMenuOpen ? <X className="w-6 h-6" /> : <div className="space-y-1.5"><span className="block w-5 h-0.5 bg-current rounded-full"></span><span className="block w-5 h-0.5 bg-current rounded-full"></span><span className="block w-5 h-0.5 bg-current rounded-full"></span></div>}
                    </button>

                    {isMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-[90]" onClick={() => setIsMenuOpen(false)}></div>
                            <div className="absolute top-full right-0 mt-3 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-[100] overflow-hidden transition-all origin-top-right">
                                <div className="flex flex-col py-2 text-left">
                                    <button onClick={() => { setIsMenuOpen(false); navigate('/guide'); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><BookOpen className="w-5 h-5 text-indigo-500" /> Инструкция</button>
                                    <button onClick={() => { setIsMenuOpen(false); navigate('/updates'); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><Rocket className="w-5 h-5 text-emerald-500" /> Обновления</button>
                                    <a href="https://t.me/BU5INESSMAN" target="_blank" rel="noopener noreferrer" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><MessageCircle className="w-5 h-5 text-blue-500" /> Техподдержка</a>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-2 mx-4"></div>
                                    <button onClick={() => { toggleTheme(); setIsMenuOpen(false); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left text-sm font-bold text-gray-700 dark:text-gray-200 w-full"><ThemeIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" /> Тема</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}
