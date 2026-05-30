import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Users } from 'lucide-react';

import DriverCard from '../features/drivers/components/DriverCard';
import DriverEditModal from '../features/drivers/components/DriverEditModal';
import DriverInviteModal from '../features/drivers/components/DriverInviteModal';
import DriverStatusModal from '../features/drivers/components/DriverStatusModal';
import { isOffice } from '../utils/roleConfig';

const STATUS_ROLES = ['foreman', 'moderator', 'boss', 'superadmin'];

export default function Drivers() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const canManage = isOffice(role);
    // v2.8: driver status change is foreman+ (broader than office).
    const canStatus = STATUS_ROLES.includes((role || '').toLowerCase());

    const [drivers, setDrivers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState('create');
    const [editorInitial, setEditorInitial] = useState(null);
    const [inviteDriver, setInviteDriver] = useState(null);
    const [statusDriver, setStatusDriver] = useState(null);

    // v2.6: equipment list no longer needed here — DriverEditModal lost its
    // "Техника по умолчанию" select. Default-driver assignment now lives
    // on the Equipment page.
    const fetchData = async () => {
        try {
            const [drv, dash] = await Promise.all([
                axios.get('/api/drivers'),
                axios.get('/api/dashboard'),
            ]);
            setDrivers(drv.data || []);
            setCategories(dash.data?.equip_categories || []);
        } catch (e) {
            toast.error('Не удалось загрузить водителей');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleSaved = (data, mode) => {
        setEditorOpen(false);
        fetchData();
        if (mode === 'create' && data?.invite_code) {
            setInviteDriver(data);
        }
    };

    const handleDelete = async (driver) => {
        if (!window.confirm(`Удалить водителя «${driver.fio || ''}»?`)) return;
        try {
            await axios.delete(`/api/drivers/${driver.user_id}`);
            toast.success('Удалён');
            fetchData();
        } catch { toast.error('Ошибка удаления'); }
    };

    const handleRegenerate = async (driver) => {
        try {
            const res = await axios.post(`/api/drivers/${driver.user_id}/regenerate-invite`);
            toast.success('Код перегенерирован');
            await fetchData();
            setInviteDriver({ ...driver, invite_code: res.data.invite_code });
        } catch { toast.error('Ошибка'); }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Users className="w-5 h-5 text-cyan-500" /> Водители ({drivers.length})
                </h3>
                {canManage && (
                    <button onClick={() => { setEditorMode('create'); setEditorInitial(null); setEditorOpen(true); }}
                        className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Добавить водителя
                    </button>
                )}
            </div>

            {drivers.length === 0 ? (
                <div className="text-center py-16 px-6 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/30">
                    <Users className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Пока нет водителей.
                    </p>
                    {canManage && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Добавьте первого — ему придёт код для входа.
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {drivers.map((d) => (
                        <DriverCard
                            key={d.user_id}
                            driver={d}
                            canManage={canManage}
                            canStatus={canStatus}
                            onEdit={(drv) => { setEditorMode('edit'); setEditorInitial(drv); setEditorOpen(true); }}
                            onDelete={handleDelete}
                            onRegenerateInvite={handleRegenerate}
                            onShowInvite={(drv) => setInviteDriver(drv)}
                            onStatus={(drv) => setStatusDriver(drv)}
                        />
                    ))}
                </div>
            )}

            <DriverEditModal
                mode={editorMode}
                open={editorOpen}
                initial={editorInitial}
                categories={categories}
                onClose={() => setEditorOpen(false)}
                onSaved={handleSaved}
                onDeleted={() => { setEditorOpen(false); fetchData(); }}
            />

            {inviteDriver && (
                <DriverInviteModal driver={inviteDriver} onClose={() => setInviteDriver(null)} />
            )}

            {statusDriver && (
                <DriverStatusModal
                    driver={statusDriver}
                    onClose={() => setStatusDriver(null)}
                    onSaved={fetchData}
                />
            )}
        </div>
    );
}
