import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import StepHours from './StepHours';
import StepWorks from './StepWorks';
import StepReview from './StepReview';
import ModalPortal from '../../../components/ui/ModalPortal';

const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.23, 1, 0.32, 1];

const STEPS = [
    { key: 'hours', label: 'Часы', number: 1 },
    { key: 'works', label: 'Работы', number: 2 },
    { key: 'review', label: 'Просмотр', number: 3 },
];

/**
 * Full-screen 3-step SMR wizard. Hosts hours + works + review steps,
 * owns the draft state, and performs the unified submit to
 * /api/kp/apps/{id}/smr/submit (or /smr/review when in approveMode).
 */
export default function SMRWizard({
    appId,
    app,
    userRole,
    tgId,
    onClose,
    onSubmitted,
    approveMode = false,
}) {
    const [step, setStep] = useState('hours');
    const [hoursData, setHoursData] = useState([]);
    const [worksData, setWorksData] = useState([]);
    const [extraWorksData, setExtraWorksData] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const goTo = (next) => setStep(next);

    const submit = async () => {
        setSubmitting(true);
        try {
            const payload = {
                hours: hoursData,
                works: worksData,
                extra_works: extraWorksData,
            };
            if (approveMode) {
                await axios.post(`/api/kp/apps/${appId}/smr/review`, {
                    action: 'edit',
                    ...payload,
                });
                toast.success('Отчёт одобрен');
            } else {
                await axios.post(`/api/kp/apps/${appId}/smr/submit`, payload);
                toast.success(
                    userRole === 'brigadier'
                        ? 'Отправлено на проверку прорабу'
                        : 'Отчёт сохранён'
                );
            }
            onSubmitted?.();
            onClose?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Ошибка сохранения');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalPortal>
        <div className="fixed inset-0 w-screen h-[100dvh] z-[9998] bg-black/60 backdrop-blur-sm overflow-y-auto" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="flex min-h-full items-start justify-center p-4 pt-6 pb-24">
                <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                        <div>
                            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                                {approveMode ? 'Проверка отчёта СМР' : 'Заполнение отчёта СМР'}
                            </h1>
                            {app && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    {(app.object_name || app.obj_name || app.object_address || '')}
                                    {app.date_target ? ` • ${app.date_target}` : ''}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            aria-label="Закрыть"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="px-6 pt-5">
                        <StepIndicator current={step} />
                    </div>

                    <div className="px-6 py-5">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={prefersReducedMotion ? {} : { opacity: 0, x: -16 }}
                                transition={{ duration: 0.22, ease: EASE }}
                            >
                                {step === 'hours' && (
                                    <StepHours
                                        appId={appId}
                                        userRole={userRole}
                                        tgId={tgId}
                                        hoursData={hoursData}
                                        setHoursData={setHoursData}
                                        onNext={() => goTo('works')}
                                    />
                                )}
                                {step === 'works' && (
                                    <StepWorks
                                        appId={appId}
                                        tgId={tgId}
                                        worksData={worksData}
                                        setWorksData={setWorksData}
                                        extraWorksData={extraWorksData}
                                        setExtraWorksData={setExtraWorksData}
                                        onNext={() => goTo('review')}
                                        onBack={() => goTo('hours')}
                                    />
                                )}
                                {step === 'review' && (
                                    <StepReview
                                        appId={appId}
                                        app={app}
                                        hoursData={hoursData}
                                        worksData={worksData}
                                        extraWorksData={extraWorksData}
                                        onEdit={() => goTo('hours')}
                                        onSubmit={submit}
                                        submitting={submitting}
                                        approveMode={approveMode}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </div>
        </ModalPortal>
    );
}

function StepIndicator({ current }) {
    const currentIdx = STEPS.findIndex(s => s.key === current);
    return (
        <div className="flex items-center justify-center gap-2">
            {STEPS.map((s, i) => {
                const reached = i <= currentIdx;
                return (
                    <div key={s.key} className="flex items-center gap-2">
                        <motion.div
                            animate={{
                                backgroundColor: reached ? 'rgb(37 99 235)' : 'rgb(229 231 235)',
                                color: reached ? '#ffffff' : 'rgb(107 114 128)',
                            }}
                            transition={{ duration: 0.2, ease: EASE }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        >
                            {s.number}
                        </motion.div>
                        <span className={`text-sm hidden sm:inline transition-colors duration-200 ${reached ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                            {s.label}
                        </span>
                        {i < STEPS.length - 1 && (
                            <div className={`w-8 h-0.5 transition-colors duration-200 ${i < currentIdx ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
