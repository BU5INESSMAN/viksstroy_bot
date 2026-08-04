export function formatApplicationNumber(appOrId) {
    if (appOrId && typeof appOrId === 'object') {
        const value = String(appOrId.public_number || '').trim();
        if (value) return value;
        return `З-${appOrId.id ?? appOrId.app_id ?? '—'}`;
    }
    return `З-${appOrId ?? '—'}`;
}
