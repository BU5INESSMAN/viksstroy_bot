import { useNavigate } from 'react-router-dom';

export default function Guide() {
  const navigate = useNavigate();

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-800 dark:text-gray-100 p-4 sm:p-8 transition-colors duration-200">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-10 mt-6 border border-transparent dark:border-gray-700">

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b dark:border-gray-700 pb-6 gap-4">
          <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400 flex items-center">
            <span className="mr-3 text-4xl">📖</span> Инструкция по системе
          </h1>
          <button onClick={() => navigate(-1)} className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold transition-colors shadow-sm">
            ⬅ Назад в систему
          </button>
        </div>

        <div className="space-y-6 text-gray-600 dark:text-gray-300 text-lg leading-relaxed">
          <p className="font-medium">Добро пожаловать в справочное руководство «ВИКС Расписание». Здесь скоро появится подробное описание всех функций системы.</p>

          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-3 text-xl">1. Управление бригадами</h3>
            <p className="text-base mb-2">Раздел находится в разработке...</p>
          </div>

          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-3 text-xl">2. Оформление заявок на технику</h3>
            <p className="text-base mb-2">Раздел находится в разработке...</p>
          </div>
        </div>

      </div>
    </div>
  );
}