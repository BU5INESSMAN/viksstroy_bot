import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function OnboardingTour({ steps, tourId, onComplete }) {
  const [cur, setCur] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(true);

  // Measure target element
  useEffect(() => {
    if (!steps[cur]) return;
    const timer = setTimeout(() => {
      const step = steps[cur];
      const el = step.target
        ? (document.querySelector(`[data-tour="${step.target}"]`) || document.querySelector(step.target))
        : null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Re-measure after scroll settles
        setTimeout(() => setRect(el.getBoundingClientRect()), 150);
      } else {
        setRect(null);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [cur, steps]);

  // Recalc on resize/scroll
  useEffect(() => {
    const recalc = () => {
      const step = steps[cur];
      if (!step?.target) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`) || document.querySelector(step.target);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true); };
  }, [cur, steps]);

  const finish = useCallback(() => {
    setVisible(false);
    try { localStorage.setItem(`tour_${tourId}_done`, '1'); } catch {}
    onComplete?.();
  }, [tourId, onComplete]);

  const next = useCallback(() => { cur < steps.length - 1 ? setCur(c => c + 1) : finish(); }, [cur, steps.length, finish]);
  const prev = useCallback(() => { if (cur > 0) setCur(c => c - 1); }, [cur]);

  if (!visible || !steps.length) return null;
  const step = steps[cur];

  // Tooltip position with viewport clamping
  const pos = step.position || 'bottom';
  const gap = 14;
  let style;
  if (!rect) {
    style = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const vw = window.innerWidth, vh = window.innerHeight;
    let top, left;
    if (pos === 'bottom') { top = rect.bottom + gap; left = rect.left + rect.width / 2; }
    else if (pos === 'top') { top = rect.top - gap; left = rect.left + rect.width / 2; }
    else if (pos === 'right') { top = rect.top + rect.height / 2; left = rect.right + gap; }
    else { top = rect.top + rect.height / 2; left = rect.left - gap; }
    // Clamp
    left = Math.max(150, Math.min(left, vw - 150));
    top = Math.max(40, Math.min(top, vh - 200));
    const tx = pos === 'left' ? 'translate(-100%, -50%)' : pos === 'right' ? 'translateY(-50%)' : pos === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
    style = { top, left, transform: tx };
  }

  const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with spotlight */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left - 6} y={rect.top - 6} width={rect.width + 12} height={rect.height + 12} rx="8" fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" style={{ pointerEvents: 'all' }} onClick={next} />
      </svg>

      {/* Highlight ring */}
      {rect && (
        <div className="absolute border-2 border-blue-500/70 rounded-lg pointer-events-none" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 3px rgba(59,130,246,0.15)' }} />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div key={cur} {...anim} className="absolute z-10 w-72 bg-gray-900 border border-white/10 rounded-xl p-4 shadow-2xl" style={{ ...style, pointerEvents: 'all' }}>
          {step.title && <h4 className="text-sm font-semibold text-white mb-1">{step.title}</h4>}
          <p className="text-[13px] text-white/70 leading-relaxed">{step.description}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
            <span className="text-[11px] text-white/25 tabular-nums">{cur + 1}/{steps.length}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={finish} className="text-[11px] text-white/30 hover:text-white/50 transition-colors px-1">Пропустить</button>
              {cur > 0 && (
                <button onClick={prev} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-white/50" />
                </button>
              )}
              <button onClick={next} className="h-7 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium flex items-center gap-0.5 hover:bg-blue-500 transition-colors">
                {cur === steps.length - 1 ? 'Готово' : 'Далее'}
                {cur < steps.length - 1 && <ChevronRight className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
