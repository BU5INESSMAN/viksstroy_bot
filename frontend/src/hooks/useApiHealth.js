import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Polls a lightweight endpoint to detect when the API is unreachable
 * (e.g. during a server update). Exposes { apiDown } for the layout
 * to render the maintenance screen.
 *
 * Design choices:
 *   - Uses native fetch (not axios) so it bypasses the 401 interceptor
 *     and isn't affected by app-wide error handling.
 *   - 401 = server alive but session expired → NOT a maintenance state.
 *   - Requires 2 consecutive failures before flipping apiDown = true
 *     (avoids flicker on a single network hiccup). First failure
 *     schedules a fast retry (~2s) so the screen appears within ~4s.
 *   - On recovery (transition apiDown → false), hard-reloads the page
 *     so all data refetches cleanly with a valid session cookie.
 */
const HEALTH_CHECK_URL = '/api/online';
const RETRY_INTERVAL = 5000;
const FAST_RETRY = 2000;
const TIMEOUT_MS = 8000;
const FAILURE_THRESHOLD = 2;

export default function useApiHealth() {
    const [apiDown, setApiDown] = useState(false);
    const failCountRef = useRef(0);
    const intervalRef = useRef(null);
    const fastRetryTimerRef = useRef(null);
    const mountedRef = useRef(true);
    const wasDownRef = useRef(false);

    const checkHealth = useCallback(async () => {
        if (!mountedRef.current) return;
        let alive = false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const response = await fetch(HEALTH_CHECK_URL, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // 2xx or 401 = server is responding. 401 means cookie is gone
            // but the backend is healthy — session expiry is handled by
            // the axios interceptor, not the maintenance screen.
            if (response.ok || response.status === 401) {
                alive = true;
            } else if (response.status >= 500) {
                alive = false;
            } else {
                // Unexpected but non-5xx — treat as alive.
                alive = true;
            }
        } catch {
            // Network error, connection refused, aborted, DNS failure.
            alive = false;
        }

        if (!mountedRef.current) return;

        if (alive) {
            failCountRef.current = 0;
            if (apiDown) setApiDown(false);
            return;
        }

        failCountRef.current += 1;
        if (failCountRef.current >= FAILURE_THRESHOLD) {
            if (!apiDown) setApiDown(true);
        } else if (failCountRef.current === 1) {
            // First failure — schedule a fast re-check so the banner
            // appears in ~4s instead of waiting a full interval.
            if (fastRetryTimerRef.current) clearTimeout(fastRetryTimerRef.current);
            fastRetryTimerRef.current = setTimeout(() => {
                fastRetryTimerRef.current = null;
                checkHealth();
            }, FAST_RETRY);
        }
    }, [apiDown]);

    useEffect(() => {
        mountedRef.current = true;
        checkHealth();
        intervalRef.current = setInterval(checkHealth, RETRY_INTERVAL);
        return () => {
            mountedRef.current = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (fastRetryTimerRef.current) clearTimeout(fastRetryTimerRef.current);
        };
    }, [checkHealth]);

    // Recovery: hard-reload once the API starts responding again so the
    // whole app refetches its initial data with a clean state.
    useEffect(() => {
        if (wasDownRef.current && !apiDown) {
            window.location.reload();
        }
        wasDownRef.current = apiDown;
    }, [apiDown]);

    return { apiDown };
}
