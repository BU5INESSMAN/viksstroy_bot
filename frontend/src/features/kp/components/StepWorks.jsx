import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';
import ExtraWorksPicker from './ExtraWorksPicker';

/**
 * Wizard step 2 — plan works (from object_kp_plan via /api/kp/apps/{id}/items)
 * + extra works picker (from /api/kp/catalog). Volumes are the only fields
 * the foreman / brigadier edits. Units and pricing come from kp_catalog.
 *
 * If a previous collaborator already filled any row, surface a banner so
 * the current user knows whose numbers they may be overwriting.
 */
export default function StepWorks({
    appId,
    tgId,
    worksData,
    setWorksData,
    extraWorksData,
    setExtraWorksData,
    onNext,
    onBack,
    readOnly = false,
}) {
    const [planItems, setPlanItems] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previousFiller, setPreviousFiller] = useState(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            axios.get(`/api/kp/apps/${appId}/items`),
            axios.get(`/api/kp/apps/${appId}/extra_works`),
            axios.get('/api/kp/catalog'),
        ])
            .then(([itemsRes, extraRes, catRes]) => {
                if (!alive) return;

                const items = (itemsRes.data || []).map(i => ({
                    kp_id: i.kp_id,
                    name: i.name,
                    category: i.category,
                    unit: i.unit || '',
                    volume: i.volume ?? '',
                    filled_by_fio: i.filled_by_fio || '',
                    filled_by_user_id: i.filled_by_user_id || null,
                }));
                setPlanItems(items);

                // Seed worksData from server if local is empty.
                if (worksData.length === 0 && items.some(i => Number(i.volume) > 0)) {
                    setWorksData(items
                        .filter(i => Number(i.volume) > 0)
                        .map(i => ({ kp_id: i.kp_id, volume: i.volume }))
                    );
                }

                // Seed extra works
                if (extraWorksData.length === 0) {
                    setExtraWorksData((extraRes.data || []).map(ew => ({
                        kp_id: ew.extra_work_id || 0,
                        name: ew.custom_name || ew.catalog_name || '',
                        unit: ew.display_unit || ew.catalog_unit || 'шт',
                        volume: ew.volume ?? '',
                    })));
                }

                setCatalog(catRes.data || []);

                // Detect previous filler
                const otherAuthor = (itemsRes.data || []).find(i =>
                    Number(i.volume) > 0 && i.filled_by_user_id && Number(i.filled_by_user_id) !== Number(tgId)
                );
                if (otherAuthor) {
                    setPreviousFiller({
                        fio: otherAuthor.filled_by_fio || 'другой пользователь',
                        filled_at: otherAuthor.filled_at || '',
                    });
                } else {
                    setPreviousFiller(null);
                }
            })
            .catch(() => toast.error('Не удалось загрузить работы'))
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appId]);

    const worksMap = useMemo(() => {
        const m = new Map();
        for (const w of worksData) m.set(w.kp_id, w.volume);
        return m;
    }, [worksData]);

    const setWorkVolume = (kp_id, value) => {
        if (readOnly) return;
        setWorksData(prev => {
            const others = prev.filter(w => w.kp_id !== kp_id);
            if (value === '' || Number(value) <= 0) return others;
            return [...others, { kp_id, volume: Number(value) }];
        });
    };

    const groupedByCategory = useMemo(() => {
        const out = {};
        for (const item of planItems) {
            const cat = item.category || 'Без категории';
            if (!out[cat]) out[cat] = [];
            out[cat].push(item);
        }
        return out;
    }, [planItems]);

    if (loading) {
        return <div className="text-center py-12 text-gray-400 dark:text-gray-500">Загрузка…</div>;
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Работы</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Укажите фактический объём выполненных работ.
                </p>
            </div>

            {previousFiller && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold text-amber-700 dark:text-amber-300">
                            {previousFiller.fio} уже заполнил работы
                        </p>
                        {previousFiller.filled_at && (
                            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                                {previousFiller.filled_at.replace('T', ' ')}
                            </p>
                        )}
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                            Проверьте значения и при необходимости отредактируйте.
                        </p>
                    </div>
                </div>
            )}

            {/* Plan works grouped by category */}
            {Object.keys(groupedByCategory).length === 0 ? (
                <div className="text-center text-sm text-gray-400 italic py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    План СМР не назначен для объекта
                </div>
            ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800">
                    {Object.entries(groupedByCategory).map(([cat, items]) => (
                        <div key={cat}>
                            <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                {cat}
                            </div>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                {items.map(it => {
                                    const current = worksMap.get(it.kp_id);
                                    return (
                                        <li key={it.kp_id} className="flex items-center gap-3 px-4 py-2.5">
                                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">
                                                {it.name}
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                disabled={readOnly}
                                                value={current ?? ''}
                                                onChange={(e) => setWorkVolume(it.kp_id, e.target.value)}
                                                placeholder="0"
                                                className="w-20 p-1.5 text-center text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                            />
                                            <span className="min-w-[2.5rem] text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                {it.unit || ''}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Extra works */}
            <ExtraWorksPicker
                catalog={catalog}
                selected={extraWorksData}
                onChange={setExtraWorksData}
                disabled={readOnly}
                defaultOpen={extraWorksData.length > 0}
            />

            {!readOnly && (
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="px-5 py-3.5 rounded-xl text-sm font-bold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors active:scale-[0.99] flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Назад
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                        Далее — просмотр <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
