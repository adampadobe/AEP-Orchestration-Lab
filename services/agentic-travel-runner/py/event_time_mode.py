"""Request-local timing for newly generated synthetic activity, not stored rows."""

from datetime import datetime, timedelta, timezone
import random
from uuid import UUID, uuid4, uuid5


class EventClock:
    def __init__(self, mode="historical", now=None):
        if mode not in ("historical", "recent"):
            raise ValueError("event_time_mode must be historical or recent")
        self.mode = mode
        reference = now or datetime.now(timezone.utc)
        if reference.tzinfo is not None:
            reference = reference.astimezone(timezone.utc).replace(tzinfo=None)
        self.now = reference
        self.generation_id = uuid4().hex

    def timestamp(self):
        # Reserve an hour for ordered session steps without producing future events.
        return self.now - timedelta(seconds=random.randint(3600, 6 * 3600))

    def identifier(self, key):
        return f"recent-{uuid5(UUID(self.generation_id), str(key)).hex}"

    def identify(self, events, id_index=0):
        result = []
        for row in events:
            values = list(row)
            values[id_index] = self.identifier(values[id_index])
            result.append(tuple(values))
        return result
