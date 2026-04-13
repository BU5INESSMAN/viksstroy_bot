import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

export default function AuthRedirect() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        const redirect = searchParams.get('redirect') || '/dashboard';

        if (!token) {
            navigate('/login', { replace: true });
            return;
        }

        axios.get(`/api/auth/session?token=${encodeURIComponent(token)}`)
            .then(res => {
                if (res.data.status === 'ok') {
                    localStorage.setItem('tg_id', res.data.tg_id);
                    localStorage.setItem('user_role', res.data.role);
                    localStorage.setItem('session_token', token);
                    navigate(redirect, { replace: true });
                }
            })
            .catch(() => {
                setError('Ссылка устарела или недействительна');
                setTimeout(() => navigate('/', { replace: true }), 2000);
            });
    }, [searchParams, navigate]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            {error ? (
                <div className="text-center">
                    <p className="text-red-500 font-bold mb-2">{error}</p>
                    <p className="text-gray-400 text-sm">Перенаправление на страницу входа...</p>
                </div>
            ) : (
                <div className="text-center">
                    <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 mx-auto mb-5" />
                    <p className="text-gray-500 dark:text-gray-400 font-bold animate-pulse">Авторизация...</p>
                </div>
            )}
        </div>
    );
}
