import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Dashboard() {
  const [data, setData] = useState({ stats: {}, teams: [] });
  const [loading, setLoading] = useState(true);
  const role = localStorage.getItem('user_role') || 'Гость';
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/dashboard')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user_role');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl text-gray-500 flex items-center">
           <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           Загрузка данных...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen text-gray-800">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">ВИКС Расписание</h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">Роль: <b className="uppercase">{role}</b></span>
          <button onClick={handleLogout} className="text-sm font-medium text-red-500 hover:text-red-700 transition">Выйти</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Заявок сегодня" value={data.stats.today_total || 0} color="blue" />
          <StatCard title="Одобрено" value={data.stats.today_approved || 0} color="green" text="text-green-600" />
          <StatCard title="Отклонено" value={data.stats.today_rejected || 0} color="red" text="text-red-600" />
          <StatCard title="Ожидают" value={data.stats.waiting_publish || 0} color="yellow" text="text-yellow-600" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center"><span className="text-2xl mr-2">👥</span> Бригады</h2>
            {data.teams.length > 0 ? (
                <ul className="space-y-2">
                {data.teams.map(t => (
                    <li key={t.id} className="p-3 bg-gray-50 rounded border flex justify-between items-center">
                    <span className="font-medium">🏗 {t.name}</span>
                    <button className="text-blue-500 hover:text-blue-700 text-sm font-medium">Управлять</button>
                    </li>
                ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-sm mb-4">Бригад пока нет.</p>
            )}
            <button className="mt-4 w-full bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200 transition font-medium">
                + Создать бригаду
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center"><span className="text-2xl mr-2">⚙️</span> Действия</h2>
            <div className="space-y-3">
              <button className="w-full bg-blue-600 text-white py-3 rounded-lg shadow hover:bg-blue-700 font-medium transition">📝 Создать новую заявку</button>

              {['moderator', 'boss', 'superadmin'].includes(role) && (
                <button className="w-full bg-green-600 text-white py-3 rounded-lg shadow hover:bg-green-700 font-medium transition">📤 Отправить наряды в группу</button>
              )}

              {['boss', 'superadmin'].includes(role) && (
                <button className="w-full bg-gray-800 text-white py-3 rounded-lg shadow hover:bg-gray-900 font-medium transition">🛠 Панель управления техникой</button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, color, text = "text-gray-900" }) {
  const borders = {
    blue: 'border-blue-500',
    green: 'border-green-500',
    red: 'border-red-500',
    yellow: 'border-yellow-500'
  };
  return (
    <div className={`bg-white p-4 rounded-lg shadow-sm border-l-4 ${borders[color]}`}>
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${text}`}>{value}</p>
    </div>
  );
}