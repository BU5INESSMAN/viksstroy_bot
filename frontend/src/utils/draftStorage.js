// Generic form-draft storage with per-user namespacing.
// Keys: draft:<formKey>:<userId>
// Values: { data, savedAt } — savedAt is ISO timestamp.
// Drafts older than 7 days are auto-purged on read.

const PREFIX = 'draft:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getUserId() {
    try {
        return localStorage.getItem('tg_id') || 'anon';
    } catch {
        return 'anon';
    }
}

function buildKey(formKey) {
    return `${PREFIX}${formKey}:${getUserId()}`;
}

export function saveDraft(formKey, data) {
    try {
        const payload = { data, savedAt: new Date().toISOString() };
        localStorage.setItem(buildKey(formKey), JSON.stringify(payload));
    } catch {
        // Silent fail — quota exceeded or storage disabled
    }
}

export function loadDraft(formKey) {
    try {
        const raw = localStorage.getItem(buildKey(formKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.savedAt) return null;
        const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
        if (ageMs > TTL_MS) {
            localStorage.removeItem(buildKey(formKey));
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function clearDraft(formKey) {
    try {
        localStorage.removeItem(buildKey(formKey));
    } catch {
        // ignore
    }
}

export function formatDraftAge(savedAt) {
    if (!savedAt) return '';
    const diffMs = Date.now() - new Date(savedAt).getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'вчера';
    return `${d} дн назад`;
}
