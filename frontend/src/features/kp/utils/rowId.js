let rowIdSequence = 0;

export function genRowId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    rowIdSequence += 1;
    return `rid_${Date.now()}_${rowIdSequence}`;
}
