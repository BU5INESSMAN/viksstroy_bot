export const STATUS_CONFIG = {
    waiting: { label: 'На модерации', color: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/50', dot: 'bg-yellow-500' },
    pending: { label: 'На модерации', color: 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/50', dot: 'bg-yellow-500' },
    approved: { label: 'Одобрена', color: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50', dot: 'bg-emerald-500' },
    published: { label: 'Опубликована', color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50', dot: 'bg-blue-500' },
    in_progress: { label: 'В работе', color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50', dot: 'bg-blue-500' },
    completed: { label: 'Завершена', color: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-700/30 dark:text-gray-400 dark:border-gray-600/50', dot: 'bg-gray-400' },
    rejected: { label: 'Отклонена', color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50', dot: 'bg-red-500' },
};

export function getStatusBadge(status) {
    return STATUS_CONFIG[status] || STATUS_CONFIG.waiting;
}
