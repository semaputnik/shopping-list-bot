"""Ranking of a List's Products against typed text."""

from collections.abc import Iterable
from typing import Protocol

MAX_SUGGESTIONS = 8
# Typos are only tolerated from this many characters on, so short input stays precise.
MIN_TYPO_LENGTH = 3


class _Product(Protocol):
    id: int
    name_norm: str
    purchase_count: int


def within_one_edit(a: str, b: str) -> bool:
    """True when ``a`` becomes ``b`` by one insertion, deletion, substitution or swap."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]:
        i += 1
    if len(a) == len(b):
        if a[i + 1 :] == b[i + 1 :]:
            return True  # one substitution
        return a[i] == b[i + 1] and a[i + 1] == b[i] and a[i + 2 :] == b[i + 2 :]  # a swap
    short, long = (a, b) if len(a) < len(b) else (b, a)
    return short[i:] == long[i + 1 :]  # one insertion/deletion


def _typo_match(query: str, name: str) -> bool:
    if len(query) < MIN_TYPO_LENGTH:
        return False
    # The whole name, any single word, or the start of the name as long as the query so far
    # (so ``малок`` already finds «молоко» while it is being typed).
    candidates = {name, *name.split()}
    for width in (len(query) - 1, len(query), len(query) + 1):
        candidates.add(name[:width])
    return any(within_one_edit(query, c) for c in candidates if c)


def match_tier(query: str, name: str) -> int | None:
    """0 exact, 1 prefix, 2 substring, 3 typo; ``None`` when the name does not match."""
    if name == query:
        return 0
    if name.startswith(query):
        return 1
    if query in name:
        return 2
    if _typo_match(query, name):
        return 3
    return None


def rank[P: _Product](query: str, products: Iterable[P]) -> list[P]:
    """Matching Products, best first: exact, prefix, substring, typo; ties by purchase count."""
    scored = []
    for product in products:
        tier = match_tier(query, product.name_norm)
        if tier is not None:
            scored.append((tier, -product.purchase_count, product.name_norm, product.id, product))
    scored.sort(key=lambda s: s[:4])
    return [s[4] for s in scored]
