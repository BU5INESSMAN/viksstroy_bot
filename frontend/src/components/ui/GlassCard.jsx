export default function GlassCard({ children, className = '', glow = '' }) {
    return (
        <div className={`relative rounded-2xl border border-white/10 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/60 backdrop-blur-xl shadow-lg shadow-black/[0.03] dark:shadow-black/20 transition-all duration-300 ${glow} ${className}`}>
            {children}
        </div>
    );
}
