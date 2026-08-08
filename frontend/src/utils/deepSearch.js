export function normalizeSearch(value) {
    const raw = Array.isArray(value)
        ? value.join(' ')
        : (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value || ''));
    return raw
        .toLocaleLowerCase('ru-RU')
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function matchesDeepSearch(value, query) {
    const needle = normalizeSearch(query);
    if (!needle) return true;
    const haystack = normalizeSearch(value);
    return needle.split(' ').every((token) => haystack.includes(token));
}
