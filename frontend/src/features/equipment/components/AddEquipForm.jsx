import { Plus } from 'lucide-react';

export default function AddEquipForm({ newEquip, setNewEquip, customCategory, setCustomCategory, categories, handleCreateEquip }) {
    return (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-lg mx-auto animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 dark:text-white">
                <Plus className="w-5 h-5 text-blue-500" /> Добавить машину
            </h3>
            <form onSubmit={handleCreateEquip} className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Название техники (Марка, гос.номер)</label>
                    <input type="text" value={newEquip.name} onChange={e => setNewEquip({...newEquip, name: e.target.value})} required className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Категория</label>
                    <select value={newEquip.category} onChange={e => {setNewEquip({...newEquip, category: e.target.value}); setCustomCategory('');}} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-3 dark:text-white transition-colors">
                        <option value="">-- Выберите категорию --</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="new">Своя категория...</option>
                    </select>
                    {newEquip.category === 'new' && (
                        <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Название новой категории" required className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                    )}
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ФИО Водителя (по умолчанию)</label>
                    <input type="text" value={newEquip.driver} onChange={e => setNewEquip({...newEquip, driver: e.target.value})} className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Госномер (необязательно)</label>
                    <input type="text" value={newEquip.license_plate || ''} onChange={e => setNewEquip({...newEquip, license_plate: e.target.value})} placeholder="А123БВ22" className="w-full p-3.5 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white transition-colors" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-md hover:shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98] mt-2">Добавить в автопарк</button>
            </form>
        </div>
    );
}
