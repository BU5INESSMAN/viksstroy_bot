/**
 * Page-specific skeleton layouts.
 * Each matches the real page's container, padding, and grid structure
 * so there is zero layout jump when data loads.
 */
import {
    SkeletonBlock,
    SkeletonCard,
    SkeletonKanban,
    SkeletonGrid,
    SkeletonList,
    SkeletonTable,
    SkeletonTabs,
    SkeletonHeader,
} from './Skeleton';

/* ─── Home.jsx ─── */
export function HomeSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-8 pb-24">
            {/* ActiveApplicationsCard area */}
            <div className="space-y-6">
                <div className="animate-pulse rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/40 p-5 space-y-3">
                    <div className="h-5 w-40 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                    <div className="h-3 w-full rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
                    <div className="h-3 w-3/4 rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
                </div>
            </div>

            {/* Header row: ЗАЯВКИ */}
            <div className="animate-pulse flex justify-between items-center mt-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                    <div className="h-7 w-32 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-9 w-24 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                    <div className="h-9 w-20 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                </div>
            </div>

            {/* Kanban */}
            <SkeletonKanban />
        </div>
    );
}

/* ─── Review.jsx ─── */
export function ReviewSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            {/* Header row */}
            <div className="animate-pulse flex flex-col sm:flex-row justify-between items-start sm:items-center pt-6 gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                    <div className="h-7 w-56 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                </div>
                <div className="h-10 w-36 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
            </div>

            {/* 3 sections with cards */}
            {['w-44', 'w-56', 'w-36'].map((w, s) => (
                <div key={s} className="space-y-4">
                    <div className="animate-pulse flex items-center gap-2 p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-white/[0.06]">
                        <div className="w-6 h-6 rounded-md bg-gray-200/80 dark:bg-white/[0.08]" />
                        <div className={`h-5 ${w} rounded-lg bg-gray-200/80 dark:bg-white/[0.08]`} />
                        <div className="h-5 w-8 rounded-full bg-gray-200/60 dark:bg-white/[0.06] ml-2" />
                    </div>
                    <SkeletonList items={2} />
                </div>
            ))}
        </div>
    );
}

/* ─── Teams.jsx (rendered inside Resources) ─── */
export function TeamsSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Create button row */}
            <div className="animate-pulse flex justify-end mb-2">
                <div className="h-10 w-44 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
            </div>
            <SkeletonGrid cards={6} />
        </div>
    );
}

/* ─── Equipment.jsx (rendered inside Resources) ─── */
export function EquipmentSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6">
            {/* Buttons row */}
            <div className="animate-pulse flex justify-end gap-2.5 mb-2">
                <div className="h-10 w-32 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                <div className="h-10 w-32 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
            </div>
            {/* Category tabs */}
            <div className="animate-pulse flex gap-2.5 pb-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`h-10 w-28 rounded-xl flex-shrink-0 ${
                        i === 0 ? 'bg-gray-300/60 dark:bg-white/[0.08]' : 'bg-gray-200/40 dark:bg-white/[0.04]'
                    }`} />
                ))}
            </div>
            <SkeletonGrid cards={6} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
        </div>
    );
}

/* ─── Objects.jsx ─── */
export function ObjectsSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            {/* Header row */}
            <div className="animate-pulse flex flex-col sm:flex-row justify-between sm:items-center pt-6 gap-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                    <div className="h-7 w-36 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-28 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                    <div className="h-10 w-28 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                </div>
            </div>
            <SkeletonGrid cards={6} />
        </div>
    );
}

/* ─── KP.jsx ─── */
export function KPSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <SkeletonHeader />
            {/* Action buttons row */}
            <div className="animate-pulse flex flex-wrap gap-2 justify-end">
                <div className="h-10 w-28 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
                <div className="h-10 w-36 rounded-xl bg-gray-200/60 dark:bg-white/[0.05]" />
            </div>
            <SkeletonTabs tabCount={3} />
            <SkeletonGrid cards={4} />
        </div>
    );
}

/* ─── System.jsx ─── */
export function SystemSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <SkeletonHeader />

            {/* Settings section */}
            <div className="animate-pulse rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-white/70 dark:bg-gray-800/40 p-6 space-y-4">
                <div className="h-5 w-44 rounded-lg bg-gray-200/80 dark:bg-white/[0.08]" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-12 rounded-xl bg-gray-200/40 dark:bg-white/[0.04]" />
                    ))}
                </div>
                <div className="h-10 w-40 rounded-xl bg-gray-200/60 dark:bg-white/[0.06] mt-2" />
            </div>

            {/* Users table */}
            <SkeletonTable rows={8} cols={3} />

            {/* Logs section */}
            <SkeletonTable rows={5} cols={4} />
        </div>
    );
}

/* ─── MyApps.jsx ─── */
export function MyAppsSkeleton() {
    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-24">
            <SkeletonHeader />

            {/* Filter buttons */}
            <div className="animate-pulse space-y-4">
                <div className="h-4 w-20 rounded-md bg-gray-200/60 dark:bg-white/[0.05]" />
                <div className="flex flex-wrap gap-2.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={`h-10 w-28 rounded-xl ${
                            i === 0 ? 'bg-gray-300/60 dark:bg-white/[0.08]' : 'bg-gray-200/40 dark:bg-white/[0.04]'
                        }`} />
                    ))}
                </div>
            </div>

            <SkeletonList items={5} />
        </div>
    );
}
