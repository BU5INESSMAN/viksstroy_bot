/**
 * Absolute-positioned counter badge for tab buttons.
 *
 * Never affects button dimensions — the label text alone drives sizing,
 * which keeps tabs stable even as counts change. Hidden when count is
 * 0 so empty tabs stay clean.
 *
 * Emil restraint: tiny circle, single primary/muted state, no animation
 * (counts refresh on data load, not continuously).
 *
 * Usage:
 *   <button className="relative …">
 *     Label
 *     <TabBadge count={5} active={isActive} />
 *   </button>
 */
export default function TabBadge({ count, active = false, className = '' }) {
    if (!count || count <= 0) return null;
    const display = count > 99 ? '99+' : count;
    return (
        <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1 pointer-events-none
                ${active
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200'}
                ${className}`}
        >
            {display}
        </span>
    );
}
