import { AlertTriangle, Upload, X } from 'lucide-react';

/**
 * BulkUploadForm — text-area upload that POSTs to
 * /api/equipment/bulk_upload with FormData `text=...`.
 *
 * v2.6: format is `name | category | plate` (3 pipe-separated fields,
 * plate optional). The old format with a trailing ФИО column is
 * rejected by the backend with HTTP 400 + structured `detail`. We
 * surface that error inline below the textarea instead of as a generic
 * toast so the operator can see which line tripped the parser.
 */
export default function BulkUploadForm({
    bulkText, setBulkText, handleBulkUpload,
    bulkError, clearBulkError,
}) {
    return (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 dark:text-white">
                <Upload className="w-5 h-5 text-gray-700 dark:text-gray-300" /> Массовая загрузка
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                Вставьте список. Каждая строка — отдельная машина. <br/>
                Формат: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md text-pink-600 dark:text-pink-400 font-bold border border-gray-200 dark:border-gray-600">название | категория | госномер</code>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
                Госномер необязателен. Водитель назначается на странице
                «Техника» после загрузки — кнопка «Изменить» рядом с
                «Драйвер по умолчанию» на карточке.
            </p>

            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50 p-4 rounded-xl mb-6 text-sm font-mono text-indigo-800 dark:text-indigo-300 shadow-inner">
                ЭКСКАВАТОР HITACHI ZX200 | Экскаваторы | А123АА22<br/>
                САМОСВАЛ КамАЗ 65111 | Самосвалы | В456ВВ22<br/>
                КРАН ИВАНОВЕЦ | Краны |
            </div>

            {bulkError && (
                <div className="mb-5 p-4 rounded-xl border-2 border-red-200 dark:border-red-800/60 bg-red-50/80 dark:bg-red-900/20">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">
                                {bulkError.error === 'format_changed'
                                    ? 'Формат изменён в v2.6'
                                    : 'Не удалось разобрать строку'}
                            </div>
                            <p className="text-sm text-red-700/90 dark:text-red-300/90 leading-relaxed">
                                {bulkError.message}
                            </p>
                            {bulkError.rejected_line && (
                                <div className="mt-2.5 p-2.5 rounded-lg bg-white/70 dark:bg-gray-900/40 border border-red-200/70 dark:border-red-800/40 font-mono text-xs text-gray-700 dark:text-gray-300 break-words">
                                    <span className="opacity-60">Строка {bulkError.rejected_line_number}:</span>{' '}
                                    {bulkError.rejected_line}
                                </div>
                            )}
                        </div>
                        {clearBulkError && (
                            <button
                                type="button"
                                onClick={clearBulkError}
                                aria-label="Закрыть"
                                className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            <form onSubmit={handleBulkUpload}>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} required rows={10} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 mb-5 dark:text-white whitespace-pre font-mono text-sm shadow-inner transition-colors custom-scrollbar" placeholder="Вставьте текст сюда..."></textarea>
                <button type="submit" className="w-full bg-gray-800 dark:bg-gray-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">Загрузить список</button>
            </form>
        </div>
    );
}
