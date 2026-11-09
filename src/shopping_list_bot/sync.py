"""In-process fan-out of change events to the SSE streams of signed-in users."""

import asyncio
import contextlib
from dataclasses import dataclass, field


@dataclass(eq=False)
class Subscriber:
    user_id: int
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict] = field(default_factory=asyncio.Queue)


class Hub:
    """Users' open streams. `publish` may be called from any thread (sync endpoints)."""

    def __init__(self) -> None:
        self._subscribers: dict[int, set[Subscriber]] = {}

    def subscribe(self, user_id: int) -> Subscriber:
        sub = Subscriber(user_id=user_id, loop=asyncio.get_running_loop())
        self._subscribers.setdefault(user_id, set()).add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        subs = self._subscribers.get(sub.user_id)
        if subs is not None:
            subs.discard(sub)
            if not subs:
                del self._subscribers[sub.user_id]

    def publish(self, user_ids: set[int] | frozenset[int], event: dict) -> None:
        for user_id in user_ids:
            for sub in list(self._subscribers.get(user_id, ())):
                with contextlib.suppress(RuntimeError):  # the stream's loop already closed
                    sub.loop.call_soon_threadsafe(sub.queue.put_nowait, event)
