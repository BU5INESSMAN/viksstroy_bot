import { useState, useRef, useEffect } from 'react';
import { MapPin, ChevronDown, Search } from 'lucide-react';

export default function ObjectSelector({ objects, selectedId, disabled, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = objects.filter(o => {
        const q = search.toLowerCase();
        return (o.name || '').toLowerCase().includes(q) || (o.address || '').toLowerCase().includes(q);
    });

    const selected = objects.find(o => o.id === parseInt(selectedId));

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3.5 rounded-xl font-bold text-left text-gray-800 dark:text-gray-100 shadow-inner disabled:opacity-80 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between gap-2"
            >
                <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>
                    {selected ? `${selected.name} ${selected.address ? `(${selected.address})` : ''}` : '-- Выберите объект из списка --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-2xl max-h-64 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600">
                            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Поиск объекта..."
                                className="w-full bg-transparent outline-none text-sm font-medium dark:text-white placeholder-gray-400"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                        {filtered.length === 0 ? (
                            <p className="text-sm text-gray-400 italic text-center py-4">Не найдено</p>
                        ) : (
                            filtered.map(obj => (
                                <button
                                    key={obj.id}
                                    type="button"
                                    onClick={() => { onSelect(obj.id); setIsOpen(false); setSearch(''); }}
                                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                                        parseInt(selectedId) === obj.id
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <MapPin className={`w-4 h-4 flex-shrink-0 ${parseInt(selectedId) === obj.id ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <span className="truncate">{obj.name} {obj.address ? `(${obj.address})` : ''}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
