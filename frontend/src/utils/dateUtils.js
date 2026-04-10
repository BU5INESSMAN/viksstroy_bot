const TZ = import.meta.env.VITE_APP_TIMEZONE || 'Asia/Barnaul';

const formatLocalDate = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
};

const getLocalDay = (date) => {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date);
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 0;
};

export const getSmartDates = () => {
    const now = new Date();
    const days = ['\u0412\u0441', '\u041f\u043d', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041f\u0442', '\u0421\u0431'];
    const labels = ['\u0421\u0435\u0433\u043e\u0434\u043d\u044f', '\u0417\u0430\u0432\u0442\u0440\u0430', '\u041f\u043e\u0441\u043b\u0435\u0437\u0430\u0432\u0442\u0440\u0430'];
    return [0, 1, 2].map(i => {
        const d = new Date(now.getTime() + i * 86400000);
        const val = formatLocalDate(d);
        const dayNum = val.split('-')[2];
        const monthNum = val.split('-')[1];
        const dayOfWeek = getLocalDay(d);
        return {
            val,
            label: `${dayNum}.${monthNum}, ${days[dayOfWeek]} (${labels[i]})`,
        };
    });
};

export const getTodayStr = () => formatLocalDate(new Date());

export const getTomorrowStr = () => formatLocalDate(new Date(Date.now() + 86400000));
