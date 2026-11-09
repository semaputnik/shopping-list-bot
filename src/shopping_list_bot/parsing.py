"""Input line parser: raw text -> ``[ParsedItem(name, note)]``.

``;`` and line breaks split items. The first comma splits the name from the Note
(``молоко, 2 л``). A single leading or trailing bare number in the name part (``2 молока``,
``молоко 2``) moves into the Note when that is unambiguous.
"""

import re
from dataclasses import dataclass

MAX_NAME = 200
MAX_NOTE = 500

_NUMBER = re.compile(r"\d+(?:\.\d+)?")


@dataclass(frozen=True)
class ParsedItem:
    name: str
    note: str | None


def _split_number(name: str) -> tuple[str, str | None]:
    """Move one leading or trailing bare number out of ``name``; ambiguous input is kept."""
    tokens = name.split()
    if len(tokens) < 2:
        return name, None
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
    return " ".join(rest), number


def parse_input(text: str) -> list[ParsedItem]:
    items: list[ParsedItem] = []
    for chunk in re.split(r"[;\n\r]+", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        name, _, note = chunk.partition(",")
        name, note = name.strip(), note.strip()
        if not name:  # ", 2 л" has no name: the text itself is the name
            name, note = chunk.strip(" ,"), ""
            if not name:
                continue
        name, number = _split_number(name)
        note = ", ".join(part for part in (number, note) if part)
        items.append(ParsedItem(name[:MAX_NAME], note[:MAX_NOTE] or None))
    return items
