import { ShieldCheck } from 'lucide-react';
import { ROLE_NAMES as roleNames } from '../../../utils/roleConfig';

export default function Header({ isTMA, realRole, role }) {
    const endRoleTest = () => {
        localStorage.setItem('user_role', realRole);
        localStorage.removeItem('real_role');
        window.location.reload();
    };

    return (
        <header className={`w-full max-w-full overflow-x-hidden bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700/80 mb-4 ${isTMA ? 'pt-16' : 'pt-4'}`}>
            {realRole && (
                <div className="bg-purple-600 text-white text-center py-2.5 font-bold flex justify-center items-center space-x-4 relative z-50 shadow-sm text-sm">
                    <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Тест роли: {roleNames[role]}</span>
                    <button onClick={endRoleTest} className="bg-white/20 px-4 py-1.5 rounded-lg text-xs transition-colors active:scale-95">Вернуться</button>
                </div>
            )}
            <nav className="px-4 sm:px-6 py-3 flex justify-center items-center max-w-7xl mx-auto">
                <div className="w-28 h-8 bg-blue-600 dark:bg-blue-500 transition-colors" style={{
                    WebkitMaskImage: 'url(/logo.png)', maskImage: 'url(/logo.png)',
                    WebkitMaskSize: 'contain', maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center', maskPosition: 'center'
                }} />
            </nav>
        </header>
    );
}
