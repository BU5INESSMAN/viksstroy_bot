import { FileText } from 'lucide-react';

export default function KP() {
    return (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-24 pt-10">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-12 border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6">
                    <FileText className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-3xl font-bold mb-3 text-gray-800 dark:text-white">Коммерческое предложение (КП)</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
                    Здесь скоро появится интерфейс для заполнения и модерации выполненных объемов работ по объектам.
                </p>
                <div className="mt-8 px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl font-bold uppercase tracking-widest text-xs">
                    В разработке (Этап 3)
                </div>
            </div>
        </main>
    );
}