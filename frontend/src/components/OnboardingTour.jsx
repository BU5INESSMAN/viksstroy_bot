import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function OnboardingTour({ steps, tourId, onComplete }) {
  const navigate = useNavigate();
  const [cur, setCur] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const retryRef = useRef(0);
  const timerRef = useRef(null);

  // Measure target element with retry logic
  const measureTarget = useCallback((stepIdx) => {
    const step = steps[stepIdx];
    if (!step?.target) { setRect(null); setNavigating(false); return; }

    const el = document.querySelector(`[data-tour="${step.target}"]`) || document.querySelector(step.target);
    if (el) {
      retryRef.current = 0;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Wait for scroll to settle, then re-measure
      setTimeout(() => {
        setRect(el.getBoundingClientRect());
        setNavigating(false);
      }, 350);
    } else if (retryRef.current < 4) {
      retryRef.current++;
      timerRef.current = setTimeout(() => measureTarget(stepIdx), 500);
    } else {
      retryRef.current = 0;
      setRect(null);
      setNavigating(false);
    }
  }, [steps]);

  // Measure on step change
  useEffect(() => {
    clearTimeout(timerRef.current);
    retryRef.current = 0;
    const delay = navigating ? 800 : 250;
    timerRef.current = setTimeout(() => measureTarget(cur), delay);
    return () => clearTimeout(timerRef.current);
  }, [cur, measureTarget, navigating]);

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

  const goToStep = useCallback((nextIdx) => {
    if (nextIdx < 0 || nextIdx >= steps.length) return;
    const nextStep = steps[nextIdx];

    if (nextStep.navigate) {
      setNavigating(true);
      navigate(nextStep.navigate);
      setTimeout(() => setCur(nextIdx), 100);
    } else if (nextStep.page && !window.location.pathname.startsWith(nextStep.page.split('?')[0])) {
      setNavigating(true);
      navigate(nextStep.page);
      setTimeout(() => setCur(nextIdx), 100);
    } else {
      setCur(nextIdx);
    }
  }, [steps, navigate]);

  const next = useCallback(() => {
    if (cur >= steps.length - 1) { finish(); return; }
    const currentStep = steps[cur];
    if (currentStep.navigate) {
      setNavigating(true);
      navigate(currentStep.navigate);
      setTimeout(() => setCur(cur + 1), 100);
    } else {
      goToStep(cur + 1);
    }
  }, [cur, steps, finish, goToStep, navigate]);

  const prev = useCallback(() => {
    if (cur <= 0) return;
    goToStep(cur - 1);
  }, [cur, goToStep]);

  if (!visible || !steps.length) return null;
  const step = steps[cur];

  // ── Tooltip positioning with proper viewport clamping ──
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const mobile = vw < 768;
  const tooltipW = mobile ? vw - 32 : 288; // w-72 = 288px; mobile = full width - 32px padding
  const tooltipH = 180; // approximate max height
  const pad = 16; // min distance from screen edge
  const gap = 12;

  let tooltipStyle;

  if (!rect) {
    // No target — center on screen
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: mobile ? `${tooltipW}px` : undefined,
    };
  } else {
    // Preferred position (mobile always bottom)
    let pos = mobile ? 'bottom' : (step.position || 'bottom');
    let top, left;

    const calcPos = (p) => {
      switch (p) {
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2 - tooltipW / 2;
          break;
        case 'top':
          top = rect.top - gap - tooltipH;
          left = rect.left + rect.width / 2 - tooltipW / 2;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipH / 2;
          left = rect.right + gap;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipH / 2;
          left = rect.left - gap - tooltipW;
          break;
      }
    };

    calcPos(pos);

    // Flip if off-screen vertically
    if (pos === 'bottom' && top + tooltipH > vh - pad) {
      pos = 'top'; calcPos(pos);
    } else if (pos === 'top' && top < pad) {
      pos = 'bottom'; calcPos(pos);
    }
    // Flip if off-screen horizontally
    if (pos === 'right' && left + tooltipW > vw - pad) {
      pos = 'left'; calcPos(pos);
    } else if (pos === 'left' && left < pad) {
      pos = 'right'; calcPos(pos);
    }

    // Final vertical clamp (after flip)
    if (top + tooltipH > vh - pad) top = vh - tooltipH - pad;
    if (top < pad) top = pad;

    // Final horizontal clamp
    if (left + tooltipW > vw - pad) left = vw - tooltipW - pad;
    if (left < pad) left = pad;

    tooltipStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: mobile ? `${tooltipW}px` : undefined,
    };
  }

  const anim = prefersReducedMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };
  const progress = ((cur + 1) / steps.length) * 100;

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
        <div className="fixed border-2 border-blue-500/70 rounded-lg pointer-events-none" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 3px rgba(59,130,246,0.15)' }} />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {!navigating && (
          <motion.div
            key={cur}
            {...anim}
            className="z-10 w-72 max-w-[calc(100vw-2rem)] bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            style={{ ...tooltipStyle, pointerEvents: 'all' }}
          >
            {/* Progress bar */}
            <div className="h-0.5 bg-white/5">
              <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            <div className="p-4">
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
                    {cur === steps.length - 1 ? 'Готово' : step.navigate ? 'Перейти' : 'Далее'}
                    {cur < steps.length - 1 && <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
