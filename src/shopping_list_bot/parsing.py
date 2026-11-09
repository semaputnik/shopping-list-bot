"""Input line parser: raw text -> ``[ParsedItem(name, note)]``.

``;`` and line breaks split items. The first comma splits the name from the Note
(``молоко, 2 л``), except a decimal comma between two digits (``вода 1,5 л``). A single leading
or trailing bare number in the name part (``2 молока``, ``молоко 2``), or a trailing
``<number> <unit>`` tail (``молоко 2 л``, ``яйца 10шт``), moves into the Note when that is
unambiguous.
"""

import re
from dataclasses import dataclass

MAX_NAME = 200
MAX_NOTE = 500

_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
# The first comma that is not a decimal comma (digit,digit).
_SEPARATOR = re.compile(r"(?<!\d),|,(?!\d)")
_UNITS = (
    "кг|г|гр|мг|л|мл|шт|уп|пач|пачка|пачки|пачек|бут|банка|банки|банок|"
    "kg|g|gr|l|lt|ml|pcs|pc|uds|ud|und|pza|pzas|paq|lata|latas|botella|botellas"
)
_UNIT = re.compile(_UNITS, re.IGNORECASE)
_TAIL = re.compile(
    rf"^(?P<name>.*?\S)\s+(?P<tail>\d+(?:[.,]\d+)?\s*(?:{_UNITS}))\.?$", re.IGNORECASE
)


@dataclass(frozen=True)
class ParsedItem:
    name: str
    note: str | None


def _split_number(name: str) -> tuple[str, str | None]:
    """Move one leading or trailing bare number out of ``name``; ambiguous input is kept."""
    tokens = name.split()
    if len(tokens) < 2:
        return name, None
    tail = _TAIL.match(name)
    if tail and not _NUMBER.fullmatch(tail["name"].split()[-1]):
        return tail["name"], tail["tail"]
    first = _NUMBER.fullmatch(tokens[0]) is not None
    last = _NUMBER.fullmatch(tokens[-1]) is not None
    if first == last:  # no number, or numbers on both ends ("2 молока 3"): leave as typed
        return name, None
    if first:
        rest = tokens[1:]
        number = tokens[0]
    else:
        rest = tokens[:-1]
        number = tokens[-1]
    # "2 3 яблока" / "яблока 2 3": more than one number, ambiguous
    neighbour = rest[0] if first else rest[-1]
    if _NUMBER.fullmatch(neighbour):
        return name, None
    if _UNIT.fullmatch(" ".join(rest)):  # "2 л" is a quantity, not an item called "л"
        return name, None
    return " ".join(rest), number


def parse_input(text: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    for chunk in re.split(r"[;\n\r]+", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        separator = _SEPARATOR.search(chunk)
        name, note = (
            (chunk[: separator.start()], chunk[separator.end() :]) if separator else (chunk, "")
        )
        name, note = name.strip(), note.strip()
        number = None
        if not name:  # ", 2 л" has no name: keep the text as typed, split nothing out of it
            name, note = chunk.strip(" ,"), ""
            if not name:
                continue
        else:
            name, number = _split_number(name)
        note = ", ".join(part for part in (number, note) if part)
        items.append(ParsedItem(name[:MAX_NAME], note[:MAX_NOTE] or None))
    return items
