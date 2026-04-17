import { useEffect, useState } from 'react';
import axios from 'axios';

const parseHour = (hhmm, fallback) => {
    if (!hhmm || typeof hhmm !== 'string') return fallback;
    const h = hhmm.split(':')[0];
    const n = parseInt(h, 10);
    if (Number.isNaN(n) || n < 0 || n > 23) return fallback;
    return String(n).padStart(2, '0');
};

/**
 * Returns default start/end hour strings ('HH') for new equipment rows,
 * sourced from admin settings (equip_base_time_start / equip_base_time_end).
 * Falls back to 08/17 while the request is in flight or fails.
 */
export default function useEquipDefaultTime() {
    const [times, setTimes] = useState({ start: '08', end: '17' });

    useEffect(() => {
        let cancelled = false;
        axios.get('/api/settings')
            .then(res => {
                if (cancelled) return;
                setTimes({
                    start: parseHour(res.data?.equip_base_time_start, '08'),
                    end: parseHour(res.data?.equip_base_time_end, '17'),
                });
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    return times;
}
