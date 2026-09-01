/* Privacy-safe product diagnostics. Never records input values or request bodies. */
const ENDPOINT = '/api/audit/events/batch';
const MAX_QUEUE = 500;
const queue = [];
let flushTimer = null;
let started = false;
let currentPage = `${location.pathname}`;
let scrollMarks = new Set();
const fieldState = new WeakMap();
const clicks = new Map();
const activeForms = new Map();

const eventId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clip = (value, size = 240) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, size);
export const cleanAuditPath = (value) => {
  let path;
  try { path = new URL(String(value || ''), location.origin).pathname; }
  catch { path = String(value || '').split('?')[0]; }
  return path
    .replace(/\/(invite|equip-invite|driver-invite)\/(?!join(?:\/|$)|redeem(?:\/|$))[^/]+/gi, '/$1/[код]')
    .replace(/\/(drivers|equipment)\/invite\/(?!join(?:\/|$)|redeem(?:\/|$))[^/]+/gi, '/$1/invite/[код]')
    .slice(0, 300);
};
const cleanPath = cleanAuditPath;

function getInstallId() {
  try {
    let value = localStorage.getItem('viks_audit_install');
    if (!value) { value = eventId(); localStorage.setItem('viks_audit_install', value); }
    return value;
  } catch { return 'storage-unavailable'; }
}

export function getClientContext() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    install_id: getInstallId(),
    standalone: Boolean(matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone),
    viewport: `${innerWidth}x${innerHeight}`,
    screen: `${screen?.width || 0}x${screen?.height || 0}`,
    pixel_ratio: devicePixelRatio || 1,
    language: navigator.language || '',
    platform: navigator.userAgentData?.platform || navigator.platform || '',
    browser: navigator.userAgent || '',
    connection: connection ? { effective_type: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt, save_data: connection.saveData } : {},
    online: navigator.onLine,
  };
}

export function sanitizeAuditMetadata(value, key = '', depth = 0) {
  if (/pass|password|token|secret|cookie|authorization|credential|code|key/i.test(key)) return '[скрыто]';
  if (depth > 4) return '[ограничено]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeAuditMetadata(item, '', depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 50).map(([k, v]) => [k.slice(0, 80), sanitizeAuditMetadata(v, k, depth + 1)]));
  if (typeof value === 'string') return clip(value
    .replace(/bearer\s+\S+/ig, 'Bearer [скрыто]')
    .replace(/((?:password|token|secret|cookie|authorization|credential|access[_-]?code|api[_-]?key)\s*[:=]\s*)[^,;\s}]+/ig, '$1[скрыто]'), 1000);
  return value;
}

export function trackAudit(eventName, data = {}) {
  const event = {
    event_uuid: eventId(), occurred_at: new Date().toISOString(), source: 'client',
    category: data.category || 'interaction', event_name: eventName,
    outcome: data.outcome || 'info', severity: data.severity || 'info',
    page: cleanPath(data.page || currentPage), route: cleanPath(data.route || ''),
    method: clip(data.method, 10).toUpperCase(), status_code: data.status_code,
    duration_ms: data.duration_ms == null ? undefined : Math.max(0, Math.round(data.duration_ms)),
    element: clip(data.element), target_type: clip(data.target_type, 60), target_id: clip(data.target_id, 80),
    error_type: clip(data.error_type, 120), error_message: clip(data.error_message, 700),
    metadata: sanitizeAuditMetadata(data.metadata || {}), client: getClientContext(),
    app_version: import.meta.env.VITE_APP_VERSION || document.documentElement.dataset.version || '',
  };
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= 20) flushAudit();
  else if (!flushTimer) flushTimer = setTimeout(flushAudit, 5000);
  return event.event_uuid;
}

export function flushAudit(useBeacon = false) {
  clearTimeout(flushTimer); flushTimer = null;
  if (!queue.length) return Promise.resolve();
  const events = queue.splice(0, 50);
  const body = JSON.stringify({ events });
  if (useBeacon && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    if (!sent) queue.unshift(...events);
    return Promise.resolve();
  }
  return fetch(ENDPOINT, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .then((response) => { if (!response.ok) throw new Error(String(response.status)); })
    .catch(() => { queue.unshift(...events); if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE; });
}

function descriptor(node) {
  if (!node) return '';
  const explicit = node.dataset?.audit || node.getAttribute?.('aria-label') || node.getAttribute?.('title');
  const label = explicit || (['BUTTON', 'A', 'SUMMARY'].includes(node.tagName) ? node.textContent : '') || node.getAttribute?.('role') || node.tagName;
  return clip(`${node.tagName?.toLowerCase() || 'element'}:${label}`, 180);
}

function emitPageView(trigger) {
  const next = location.pathname;
  if (next !== currentPage) {
    activeForms.forEach((state, form) => trackAudit('form_abandoned', { category: 'friction', outcome: 'abandoned', element: descriptor(form), duration_ms: performance.now() - state.at, metadata: { changed_fields: state.fields.size, trigger } }));
    activeForms.clear(); currentPage = next; scrollMarks = new Set();
  }
  trackAudit('page_view', { category: 'navigation', page: next, metadata: { trigger, title: clip(document.title, 120) } });
}

export function initProductAudit() {
  if (started) return; started = true;
  trackAudit('app_start', { category: 'lifecycle', metadata: { referrer_path: cleanPath(document.referrer) } });
  emitPageView('initial');

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function auditHistory(...args) { const result = original.apply(this, args); queueMicrotask(() => emitPageView(method)); return result; };
  }
  addEventListener('popstate', () => emitPageView('popstate'));
  addEventListener('online', () => trackAudit('network_online', { category: 'lifecycle', outcome: 'success' }));
  addEventListener('offline', () => trackAudit('network_offline', { category: 'error', outcome: 'error', severity: 'warning' }));
  addEventListener('visibilitychange', () => trackAudit(document.hidden ? 'app_background' : 'app_foreground', { category: 'lifecycle' }));
  addEventListener('pagehide', () => { trackAudit('app_exit', { category: 'lifecycle' }); flushAudit(true); });

  document.addEventListener('click', (event) => {
    const node = event.target?.closest?.('button,a,input[type="button"],input[type="submit"],[role="button"],summary');
    if (!node) return;
    const element = descriptor(node);
    trackAudit('click', { element, target_type: node.tagName?.toLowerCase(), target_id: node.dataset?.id || '',
      metadata: { disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true') } });
    const now = performance.now(); const recent = (clicks.get(element) || []).filter((stamp) => now - stamp < 2000); recent.push(now); clicks.set(element, recent);
    if (recent.length === 3) trackAudit('rage_click', { category: 'friction', outcome: 'rejected', severity: 'warning', element, metadata: { clicks: recent.length, window_ms: 2000 } });
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target; const fields = [...(form.elements || [])].filter((field) => field.name && !['hidden', 'password'].includes(field.type));
    trackAudit('form_submit', { category: 'form', element: descriptor(form), metadata: { field_count: fields.length, invalid_count: fields.filter((field) => !field.checkValidity()).length } });
    activeForms.delete(form);
  }, true);
  document.addEventListener('focusin', (event) => {
    const field = event.target; if (!field.matches?.('input,select,textarea')) return;
    fieldState.set(field, { at: performance.now(), changed: false });
  }, true);
  document.addEventListener('input', (event) => {
    const state = fieldState.get(event.target); if (state) state.changed = true;
    const form = event.target.form || event.target.closest?.('form');
    if (form) { const formData = activeForms.get(form) || { at: performance.now(), fields: new Set() }; formData.fields.add(event.target.name || event.target.id || event.target.type); activeForms.set(form, formData); }
  }, true);
  document.addEventListener('focusout', (event) => {
    const field = event.target; const state = fieldState.get(field); if (!state) return;
    const duration = performance.now() - state.at; const element = clip(`${field.tagName.toLowerCase()}:${field.name || field.id || field.type}`, 160);
    if (!field.checkValidity()) trackAudit('invalid_field', { category: 'friction', outcome: 'rejected', element, duration_ms: duration, metadata: { required: field.required, type: field.type } });
    else if (state.changed && duration >= 15000) trackAudit('long_field_edit', { category: 'friction', element, duration_ms: duration, metadata: { type: field.type } });
    else trackAudit('field_complete', { category: 'form', element, duration_ms: duration, metadata: { changed: state.changed, type: field.type } });
    fieldState.delete(field);
  }, true);

  let scrolling = false;
  addEventListener('scroll', () => {
    if (scrolling) return; scrolling = true;
    requestAnimationFrame(() => {
      scrolling = false; const total = Math.max(1, document.documentElement.scrollHeight - innerHeight); const percent = Math.round(scrollY * 100 / total);
      [25, 50, 75, 100].forEach((mark) => { if (percent >= mark && !scrollMarks.has(mark)) { scrollMarks.add(mark); trackAudit('scroll_depth', { category: 'navigation', metadata: { percent: mark } }); } });
    });
  }, { passive: true });

  addEventListener('error', (event) => trackAudit('javascript_error', { category: 'error', outcome: 'error', severity: 'error', error_type: event.error?.name || 'Error', error_message: event.message, metadata: { file: cleanPath(event.filename), line: event.lineno, column: event.colno } }));
  addEventListener('unhandledrejection', (event) => trackAudit('unhandled_rejection', { category: 'error', outcome: 'error', severity: 'error', error_type: event.reason?.name || 'PromiseRejection', error_message: event.reason?.message || String(event.reason || '') }));

  try {
    new MutationObserver((mutations) => mutations.forEach((mutation) => [...mutation.addedNodes].forEach((node) => {
      if (!(node instanceof Element)) return;
      const dialogs = [node, ...node.querySelectorAll?.('[role="dialog"],dialog,[aria-modal="true"]') || []].filter((item) => item.matches?.('[role="dialog"],dialog,[aria-modal="true"]'));
      dialogs.forEach((dialog) => requestAnimationFrame(() => {
        const rect = dialog.getBoundingClientRect(); const overflow = rect.top < 0 || rect.bottom > innerHeight || rect.width > innerWidth;
        trackAudit('modal_open', { category: overflow ? 'friction' : 'interaction', outcome: overflow ? 'rejected' : 'info', severity: overflow ? 'warning' : 'info', element: descriptor(dialog), metadata: { overflow, rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) }, viewport_height: innerHeight } });
      }));
    }))).observe(document.documentElement, { childList: true, subtree: true });
  } catch { /* old WebView */ }

  try {
    const metrics = { long_tasks: 0, long_task_ms: 0, cls: 0, lcp_ms: 0 };
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => { metrics.long_tasks += 1; metrics.long_task_ms += Math.round(entry.duration); })).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => { if (!entry.hadRecentInput) metrics.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => { const entries = list.getEntries(); metrics.lcp_ms = Math.round(entries.at(-1)?.startTime || 0); }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => trackAudit('performance_snapshot', { category: 'performance', duration_ms: metrics.lcp_ms, metadata: { ...metrics, cls: Number(metrics.cls.toFixed(4)), navigation_ms: Math.round(performance.getEntriesByType('navigation')[0]?.duration || 0) } }), 10000);
  } catch { /* older WebViews */ }
  setInterval(() => flushAudit(), 15000);
}

export function trackReactError(error, info = {}) {
  trackAudit('react_render_error', { category: 'error', outcome: 'error', severity: 'critical', error_type: error?.name || 'ReactError', error_message: error?.message || String(error), metadata: { component_stack: clip(info.componentStack, 1000) } });
  flushAudit(true);
}

export function trackApiFailure(error) {
  const config = error?.config || {}; const status = error?.response?.status;
  trackAudit('api_failure', { category: 'api', outcome: status && status < 500 ? 'rejected' : 'error', severity: status >= 500 || !status ? 'error' : 'warning',
    route: cleanPath(config.url), method: config.method, status_code: status, duration_ms: config.__auditStarted ? performance.now() - config.__auditStarted : undefined,
    error_type: error?.code || error?.name || 'ApiError', error_message: error?.response?.data?.detail || error?.message || `HTTP ${status}` });
}
