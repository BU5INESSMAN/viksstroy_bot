/**
 * FIO helpers mirroring web/utils_fio.py.
 *
 *   formatFio('Иванов', 'Иван', 'Иванович')      → 'Иванов Иван Иванович'
 *   parseFio('Иванов Иван Иванович')             → { lastName, firstName, middleName }
 */
export function formatFio(lastName, firstName, middleName) {
    return [lastName, firstName, middleName]
        .map(p => (p || '').trim())
        .filter(Boolean)
        .join(' ');
}

export function parseFio(fio) {
    const parts = (fio || '').trim().split(/\s+/).filter(Boolean);
    return {
        lastName: parts[0] || '',
        firstName: parts[1] || '',
        middleName: parts[2] || '',
    };
}

/** Prefer the new 3-field FIO; fall back to the denormalized `fio` column. */
export function displayFio(user) {
    if (!user) return '';
    const composed = formatFio(user.last_name, user.first_name, user.middle_name);
    return composed || user.fio || '';
}
