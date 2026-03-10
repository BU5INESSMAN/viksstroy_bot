import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function JoinTeam() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [teamData, setTeamData] = useState(null);
  const [error, setError] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    axios.get(`/api/invite/${code}`)
      .then(res => setTeamData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Ссылка недействительна"));
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('invite_code', code);
      formData.append('password', password);
      formData.append('worker_id', selectedWorker);

      await axios.post('/api/invite/join', formData);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Неверный пароль или ошибка сервера");
    }
  };

  if (error && !teamData) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <div className="bg-red-100 text-red-700 p-6 rounded-lg shadow-md font-medium text-lg">{error}</div>
        </div>
    );
  }

  if (!teamData) return <div className="flex items-center justify-center min-h-screen text-gray-500">Загрузка данных...</div>;

  if (success) return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm text-center border-t-4 border-green-500">
              <span className="text-5xl block mb-4">✅</span>
              <h2 className="text-xl font-bold mb-2 text-gray-800">Успешно!</h2>
              <p className="text-gray-600 mb-6">Вы успешно присоединены к бригаде <b>{teamData.team_name}</b>.</p>
              <button onClick={() => navigate('/')} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">Перейти на главную</button>
          </div>
      </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-2">ВИКС Расписание</h1>
        <h2 className="text-lg text-center font-medium text-gray-700 mb-6">Приглашение в бригаду<br/>«{teamData.team_name}»</h2>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4 text-sm text-center">{error}</div>}

        {teamData.unclaimed_workers.length === 0 ? (
            <div className="text-center bg-gray-100 p-4 rounded-lg text-gray-500">В данной бригаде больше нет свободных мест для привязки.</div>
        ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Выберите себя из списка</label>
                <select
                  required
                  value={selectedWorker}
                  onChange={(e) => setSelectedWorker(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="" disabled>-- Нажмите для выбора --</option>
                  {teamData.unclaimed_workers.map(w => (
                    <option key={w.id} value={w.id}>{w.fio} ({w.position})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пароль бригады</label>
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Выдает прораб (6 цифр)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center"
                  maxLength="6"
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium shadow-sm">
                Подтвердить и присоединиться
              </button>
            </form>
        )}
      </div>
    </div>
  );
}