// ============================================================
// SHARED UI HELPERS FOR SYSTEM PAGE
// ============================================================

// GlassCard
export function GlassCard({ children, className = '', glow = '' }) {
    return (
        <div className={`relative rounded-2xl border border-white/10 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/60 backdrop-blur-xl shadow-lg shadow-black/[0.03] dark:shadow-black/20 transition-all duration-300 ${glow} ${className}`}>
            {children}
        </div>
    );
}

// SectionHeader
export function SectionHeader({ icon: Icon, iconColor, title, subtitle }) {
    return (
        <div className="mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2.5 text-gray-800 dark:text-gray-100">
                <div className={`p-2 rounded-xl ${iconColor} bg-opacity-10 dark:bg-opacity-20`}>
                    <Icon className="w-5 h-5" />
                </div>
                {title}
            </h2>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-[42px] font-medium">{subtitle}</p>}
        </div>
    );
}

// Toggle
export function Toggle({ name, checked, onChange, color = 'blue' }) {
    const colors = {
        blue: 'peer-checked:bg-blue-600 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800',
        orange: 'peer-checked:bg-orange-500 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800',
        emerald: 'peer-checked:bg-emerald-500 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800',
        violet: 'peer-checked:bg-violet-500 peer-focus:ring-violet-300 dark:peer-focus:ring-violet-800',
        cyan: 'peer-checked:bg-cyan-500 peer-focus:ring-cyan-300 dark:peer-focus:ring-cyan-800',
    };
    return (
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
            <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 ${colors[color] || colors.blue}`}></div>
        </label>
    );
}

// Role constants
export const ROLE_ORDER = ['superadmin', 'boss', 'moderator', 'foreman', 'brigadier', 'worker', 'driver'];
export const ROLE_NAMES = {
    superadmin: 'Супер-Админ', boss: 'Руководитель', moderator: 'Модератор',
    foreman: 'Прораб', brigadier: 'Бригадир', worker: 'Рабочий', driver: 'Водитель', 'Гость': 'Гость'
};
export const ROLE_COLORS = {
    superadmin: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
    boss: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50',
    moderator: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50',
    foreman: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
    brigadier: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800/50',
    worker: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:border-gray-600/50',
    driver: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/50',
};
export const ROLE_ICON_COLORS = {
    superadmin: 'text-red-500', boss: 'text-amber-500', moderator: 'text-blue-500',
    foreman: 'text-emerald-500', brigadier: 'text-violet-500', worker: 'text-gray-400', driver: 'text-cyan-500',
};
