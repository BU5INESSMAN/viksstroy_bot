/**
 * Reusable skeleton loading primitives.
 * Zero-dependency — Tailwind animate-pulse only.
 * Matches app dark/light theme via dark: variants.
 */

/** Single rectangular placeholder block */
export function SkeletonBlock({ className = '' }) {
    return (
        <div
            className={`animate-pulse rounded-lg bg-gray-200/80 dark:bg-white/[0.06] ${className}`}
        />
    );
}

/** Card-shaped skeleton matching GlassCard dimensions */
export function SkeletonCard({ className = '' }) {
    return (
        <div
            className={`animate-pulse rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/40 p-5 space-y-3.5 ${className}`}
        >
            {/* Title line */}
            <div className="h-5 w-3/4 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
            {/* Body lines */}
            <div className="space-y-2.5">
                <div className="h-3 w-full rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
                <div className="h-3 w-5/6 rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
                <div className="h-3 w-2/3 rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
            </div>
            {/* Footer line */}
            <div className="h-4 w-1/2 rounded-lg bg-gray-200/50 dark:bg-white/[0.04] mt-1" />
        </div>
    );
}

/** Table skeleton: header row + N body rows */
export function SkeletonTable({ rows = 5, cols = 3 }) {
    return (
        <div className="animate-pulse rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/40 overflow-hidden">
            {/* Header */}
            <div className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
                {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="h-4 flex-1 rounded-md bg-gray-200/80 dark:bg-white/[0.08]" />
                ))}
            </div>
            {/* Body rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div
                    key={r}
                    className="flex gap-4 px-4 py-3 border-b border-gray-50 dark:border-white/[0.03] last:border-b-0"
                >
                    {Array.from({ length: cols }).map((_, c) => (
                        <div key={c} className="h-3 flex-1 rounded-md bg-gray-200/50 dark:bg-white/[0.04]" />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** 4-column kanban layout matching Home.jsx */
export function SkeletonKanban() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, col) => (
                <div key={col} className="space-y-3">
                    {/* Column header */}
                    <div className="animate-pulse flex items-center gap-2 p-3 rounded-xl bg-gray-100/80 dark:bg-gray-800/40 border border-gray-100 dark:border-white/[0.06]">
                        <div className="w-5 h-5 rounded-md bg-gray-200/80 dark:bg-white/[0.08]" />
                        <div className="h-4 w-24 rounded-md bg-gray-200/80 dark:bg-white/[0.08]" />
                        <div className="h-5 w-6 rounded-full bg-gray-200/60 dark:bg-white/[0.06] ml-auto" />
                    </div>
                    {/* Column cards */}
                    {Array.from({ length: 2 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ))}
        </div>
    );
}

/** Generic responsive card grid */
export function SkeletonGrid({ cards = 6, cols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }) {
    return (
        <div className={`grid gap-5 ${cols}`}>
            {Array.from({ length: cards }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

/** Vertical list of card skeletons (for Review, MyApps) */
export function SkeletonList({ items = 5 }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: items }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

/** Tab bar skeleton */
export function SkeletonTabs({ tabCount = 3 }) {
    return (
        <div className="animate-pulse flex gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
            {Array.from({ length: tabCount }).map((_, i) => (
                <div
                    key={i}
                    className={`flex-1 h-10 rounded-xl ${
                        i === 0
                            ? 'bg-white/90 dark:bg-gray-700/60'
                            : 'bg-gray-200/40 dark:bg-white/[0.03]'
                    }`}
                />
            ))}
        </div>
    );
}

/** Section header skeleton (icon + title) */
export function SkeletonHeader() {
    return (
        <div className="animate-pulse flex items-center gap-3 pt-6">
            <div className="w-7 h-7 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
            <div className="h-7 w-48 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
        </div>
    );
}
