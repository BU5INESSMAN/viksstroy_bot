import { Upload } from 'lucide-react';

export default function BulkUploadForm({ bulkText, setBulkText, handleBulkUpload }) {
    return (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 dark:text-white">
                <Upload className="w-5 h-5 text-gray-700 dark:text-gray-300" /> Массовая загрузка
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
                Вставьте список. Каждая строка — отдельная машина. <br/>
                Формат: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md text-pink-600 dark:text-pink-400 font-bold border border-gray-200 dark:border-gray-600">Категория | Название техники | ФИО водителя</code>
            </p>

            <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50 p-4 rounded-xl mb-6 text-sm font-mono text-indigo-800 dark:text-indigo-300 shadow-inner">
                Экскаваторы | ЭКСКАВАТОР 1 | Иванов И.И.<br/>
                Самосвалы | САМОСВАЛ 2 | Петров П.П.<br/>
                Краны | КРАН 3 |
            </div>

            <form onSubmit={handleBulkUpload}>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} required rows={10} className="w-full p-4 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 mb-5 dark:text-white whitespace-pre font-mono text-sm shadow-inner transition-colors custom-scrollbar" placeholder="Вставьте текст сюда..."></textarea>
                <button type="submit" className="w-full bg-gray-800 dark:bg-gray-700 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-all active:scale-[0.98]">Загрузить список</button>
            </form>
        </div>
    );
}
