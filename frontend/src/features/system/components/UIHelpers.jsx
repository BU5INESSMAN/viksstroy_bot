// ============================================================
// SHARED UI HELPERS FOR SYSTEM PAGE
// ============================================================

// GlassCard — re-exported from shared component
import GlassCardShared from '../../../components/ui/GlassCard';
export const GlassCard = GlassCardShared;

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

// Role constants — re-exported from shared roleConfig
export { ROLE_ORDER, ROLE_NAMES, ROLE_COLORS, ROLE_ICON_COLORS } from '../../../utils/roleConfig';
