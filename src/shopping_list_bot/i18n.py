"""Server-side strings and language selection. The UI strings live in the frontend."""

SUPPORTED_LANGUAGES = ("ru", "es")
DEFAULT_LANGUAGE = "ru"

FIRST_LIST_NAME = {"ru": "Покупки", "es": "Compras"}


def pick_language(language_code: str | None) -> str:
    """Map a Telegram ``language_code`` (e.g. ``es-MX``) to a supported UI language."""
    base = (language_code or "").lower().replace("_", "-").split("-")[0]
    return base if base in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


# System Categories (docs/ui-spec.md section 3.5) in display order: a stable key and the
# name per language. "Без категории" is always last.
SYSTEM_CATEGORIES = [
    ("fruit_veg", {"ru": "Фрукты и овощи", "es": "Frutas y verduras"}),
    ("bread", {"ru": "Хлеб", "es": "Pan"}),
    ("dairy", {"ru": "Молочное", "es": "Lácteos"}),
    ("meat_fish", {"ru": "Мясо и рыба", "es": "Carne y pescado"}),
    ("frozen", {"ru": "Заморозка", "es": "Congelados"}),
    ("pantry", {"ru": "Бакалея", "es": "Despensa"}),
    ("drinks", {"ru": "Напитки", "es": "Bebidas"}),
    ("household", {"ru": "Бытовая химия", "es": "Limpieza"}),
    ("hygiene", {"ru": "Гигиена", "es": "Higiene"}),
    ("other", {"ru": "Прочее", "es": "Otros"}),
    ("uncategorized", {"ru": "Без категории", "es": "Sin categoría"}),
]


def effective_language(language: str | None, language_code: str | None) -> str:
    """The user's chosen language if they set one, else the one Telegram suggests."""
    return language if language in SUPPORTED_LANGUAGES else pick_language(language_code)
