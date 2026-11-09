"""Name normalisation shared by Product memory and the Category guesser."""

import unicodedata


def normalize(text: str) -> str:
    """Lower-case, strip diacritics (``plátano`` -> ``platano``), collapse whitespace."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(stripped.split())
