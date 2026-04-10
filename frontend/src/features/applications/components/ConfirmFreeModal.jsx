export default function ConfirmFreeModal({ freeModal, setFreeModal, isSubmitting, executeFree }) {
    return (
        <div className="fixed inset-0 w-screen h-[100dvh] z-[120] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative">
                <h3 className="text-2xl font-bold mb-2 dark:text-white">Подтверждение</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                    Для завершения работы и освобождения, напишите слово <b className="text-gray-900 dark:text-white uppercase tracking-wider">свободен</b>:
                </p>
                <input
                    type="text"
                    value={freeModal.inputValue}
                    onChange={e => setFreeModal({...freeModal, inputValue: e.target.value})}
                    className="w-full border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 p-4 rounded-xl mb-6 dark:bg-gray-700 dark:border-gray-600 dark:text-white uppercase text-center font-bold tracking-widest outline-none transition-colors"
                    placeholder="СВОБОДЕН"
                    disabled={isSubmitting}
                />
                <div className="flex gap-3">
                    <button disabled={isSubmitting} onClick={() => setFreeModal({isOpen: false, type: '', app: null, teamId: null, inputValue: ''})} className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 py-3.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 transition-colors active:scale-[0.98]">
                        Отмена
                    </button>
                    <button
                        onClick={executeFree}
                        disabled={isSubmitting || freeModal.inputValue.trim().toLowerCase() !== 'свободен'}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-bold transition-all flex justify-center items-center shadow-md active:scale-[0.98]"
                    >
                        {isSubmitting ? '⏳ Обработка...' : 'Подтвердить'}
                    </button>
                </div>
            </div>
        </div>
    );
}
