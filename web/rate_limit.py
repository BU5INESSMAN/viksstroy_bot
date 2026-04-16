"""Simple in-memory sliding-window rate limiter keyed by user_id.

Not meant for distributed deployments (single-process). Good enough for
single-container FastAPI apps to throttle expensive AI calls per user.
"""
import time
import asyncio
from collections import defaultdict, deque


class UserRateLimiter:
    """Per-user sliding-window rate limiter with concurrency cap."""

    def __init__(self, max_per_window: int = 10, window_sec: int = 60, max_concurrent: int = 3):
        self.max_per_window = max_per_window
        self.window_sec = window_sec
        self.max_concurrent = max_concurrent
        self._hits = defaultdict(deque)
        self._active = defaultdict(int)
        self._lock = asyncio.Lock()

    async def acquire(self, user_id: int):
        """Try to reserve a slot. Returns (ok, reason)."""
        async with self._lock:
            now = time.monotonic()
            hits = self._hits[user_id]

            # Drop expired entries
            cutoff = now - self.window_sec
            while hits and hits[0] < cutoff:
                hits.popleft()

            # Concurrency check
            if self._active[user_id] >= self.max_concurrent:
                return False, "Слишком много одновременных запросов. Подождите."

            # Rate check
            if len(hits) >= self.max_per_window:
                wait = int(self.window_sec - (now - hits[0])) + 1
                return False, f"Превышен лимит сообщений. Подождите {wait} сек."

            hits.append(now)
            self._active[user_id] += 1
            return True, ""

    async def release(self, user_id: int):
        """Release a concurrency slot when request finishes."""
        async with self._lock:
            if self._active[user_id] > 0:
                self._active[user_id] -= 1


# Global instance for support chat: 10 messages/minute, max 3 concurrent
support_limiter = UserRateLimiter(max_per_window=10, window_sec=60, max_concurrent=3)
