import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Upload, Search } from 'lucide-react';

import EquipmentCard from '../features/equipment/components/EquipmentCard';
import AddEquipForm from '../features/equipment/components/AddEquipForm';
import BulkUploadForm from '../features/equipment/components/BulkUploadForm';
import EquipmentInviteModal from '../features/equipment/components/EquipmentInviteModal';
import EditEquipmentModal from '../features/equipment/components/EditEquipmentModal';
import EquipmentStatsModal from '../features/equipment/components/EquipmentStatsModal';
import useConfirm from '../hooks/useConfirm';
import { EquipmentSkeleton } from '../components/ui/PageSkeletons';

export default function Equipment() {
    const role = localStorage.getItem('user_role') || 'Гость';
    const tgId = localStorage.getItem('tg_id') || '0';
    const { openProfile } = useOutletContext();

    const [equipment, setEquipment] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState('list');

    const [newEquip, setNewEquip] = useState({ name: '', driver: '', category: '', license_plate: '' });
    const [customCategory, setCustomCategory] = useState('');
    const [bulkText, setBulkText] = useState('');

    const [inviteInfo, setInviteInfo] = useState(null);
    const [copiedLink, setCopiedLink] = useState('');
    const [editingEquip, setEditingEquip] = useState(null);
    const [statsEquip, setStatsEquip] = useState(null);

    const canManageEquipment = ['foreman', 'moderator', 'boss', 'superadmin'].includes(role);
    const canDeleteEquipment = ['moderator', 'boss', 'superadmin'].includes(role);
    const { confirm, ConfirmUI } = useConfirm();

    const fetchData = async () => {
        try {
            const [equipRes, dashRes] = await Promise.all([axios.get('/api/equipment/admin_list'), axios.get('/api/dashboard')]);
            setEquipment(equipRes.data || []);
            const cats = dashRes.data?.equip_categories || [];
            setCategories(cats);
            if (cats.length > 0 && !cats.includes(activeTab) && activeTab !== 'list' && activeTab !== 'new' && activeTab !== 'bulk') {
                setActiveTab(cats[0]);
            }
            setLoading(false);
        } catch (e) { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreateEquip = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('name', newEquip.name);
            fd.append('driver', newEquip.driver);
            fd.append('category', customCategory || newEquip.category);
            fd.append('license_plate', newEquip.license_plate || '');
            await axios.post('/api/equipment/create', fd);
            setNewEquip({ name: '', driver: '', category: '', license_plate: '' });
            setCustomCategory('');
            setActiveTab('list');
            fetchData();
            toast.success("Техника добавлена!");
        } catch (e) { toast.error("Ошибка добавления"); }
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            fd.append('text', bulkText);
            const res = await axios.post('/api/equipment/bulk_upload', fd);
            setBulkText('');
            setActiveTab('list');
            fetchData();
            toast.success(`Успешно загружено единиц: ${res.data.added}`);
        } catch (e) { toast.error("Ошибка массовой загрузки"); }
    };

    const handleDeleteEquip = async (id) => {
        const ok = await confirm("Удалить эту технику из базы?", { title: "Удаление техники", confirmText: "Удалить" });
        if (!ok) return;
        try {
            await axios.post(`/api/equipment/${id}/delete`);
            fetchData();
        } catch (e) { toast.error("Ошибка удаления"); }
    };

    const handleEquipStatusChange = async (id, newStatus) => {
        try {
            const fd = new FormData(); fd.append('status', newStatus);
            await axios.post(`/api/equipment/${id}/status`, fd);
            fetchData();
        } catch (e) { toast.error("Ошибка изменения статуса"); }
    };

    const handleUnlinkEquipment = async (equipId) => {
        const ok = await confirm("Отвязать Telegram/MAX аккаунт водителя от этой техники?", { title: "Отвязка аккаунта", variant: "warning", confirmText: "Отвязать" });
        if (!ok) return;
        try {
            await axios.post(`/api/equipment/${equipId}/unlink`);
            fetchData();
        } catch (e) {
            toast.error("Ошибка при отвязке аккаунта");
        }
    };

    const generateInvite = async (eq) => {
        try {
            const res = await axios.post(`/api/equipment/${eq.id}/generate_invite`);
            setInviteInfo({...res.data, equipName: `${eq.name} [${eq.license_plate || 'нет г.н.'}]`});
            setCopiedLink('');
        } catch (e) { toast.error("Ошибка генерации ссылки"); }
    };

    if (loading) return <EquipmentSkeleton />;

    return (
        <div className="px-4 sm:px-6 lg:px-8 space-y-6">

            {/* Кнопки управления теперь выровнены по правому краю */}
            {canManageEquipment && (
                <div className="flex justify-end gap-2.5 mb-2">
                    <button data-tour="equip-add-btn" onClick={() => setActiveTab('new')} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Добавить
                    </button>
                    <button onClick={() => setActiveTab('bulk')} className="bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-lg hover:bg-gray-900 transition-all active:scale-95 flex items-center gap-2 dark:bg-gray-700 dark:hover:bg-gray-600">
                        <Upload className="w-4 h-4" /> Загрузка
                    </button>
                </div>
            )}

            <div className="flex overflow-x-auto space-x-2.5 pb-2 custom-scrollbar" data-tour="equip-categories">
                <button onClick={() => setActiveTab('list')} className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>Все машины</button>
                {categories.map(c => (
                    <button key={c} onClick={() => setActiveTab(c)} className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === c ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{c}</button>
                ))}
            </div>

            {['list', ...categories].includes(activeTab) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-tour="equip-grid">
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).map(eq => (
                        <EquipmentCard
                            key={eq.id}
                            eq={eq}
                            canManageEquipment={canManageEquipment}
                            canDeleteEquipment={canDeleteEquipment}
                            openProfile={openProfile}
                            handleUnlinkEquipment={handleUnlinkEquipment}
                            generateInvite={generateInvite}
                            handleEquipStatusChange={handleEquipStatusChange}
                            onEdit={setEditingEquip}
                            onStats={setStatsEquip}
                        />
                    ))}
                    {equipment.filter(e => activeTab === 'list' || e.category === activeTab).length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
                            <Search className="w-12 h-12 mb-3 opacity-20" />
                            <p className="italic font-medium">В этой категории пока нет техники.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ВКЛАДКА ДОБАВЛЕНИЯ ТЕХНИКИ */}
            {activeTab === 'new' && canManageEquipment && (
                <AddEquipForm
                    newEquip={newEquip}
                    setNewEquip={setNewEquip}
                    customCategory={customCategory}
                    setCustomCategory={setCustomCategory}
                    categories={categories}
                    handleCreateEquip={handleCreateEquip}
                />
            )}

            {/* ВКЛАДКА МАССОВОЙ ЗАГРУЗКИ */}
            {activeTab === 'bulk' && canManageEquipment && (
                <BulkUploadForm
                    bulkText={bulkText}
                    setBulkText={setBulkText}
                    handleBulkUpload={handleBulkUpload}
                />
            )}

            {/* ОКНО РЕДАКТИРОВАНИЯ ТЕХНИКИ */}
            {editingEquip && (
                <EditEquipmentModal
                    equipment={editingEquip}
                    categories={categories}
                    onClose={() => setEditingEquip(null)}
                    onUpdate={fetchData}
                />
            )}

            {/* ОКНО СО ССЫЛКАМИ ДЛЯ ВОДИТЕЛЯ */}
            <EquipmentInviteModal
                inviteInfo={inviteInfo}
                setInviteInfo={setInviteInfo}
                copiedLink={copiedLink}
                setCopiedLink={setCopiedLink}
            />
            <EquipmentStatsModal isOpen={!!statsEquip} onClose={() => setStatsEquip(null)} equipment={statsEquip} tgId={tgId} />
            {ConfirmUI}
        </div>
    );
}
