"""Server-side strings and language selection. The UI strings live in the frontend."""

SUPPORTED_LANGUAGES = ("ru", "es")
DEFAULT_LANGUAGE = "ru"

FIRST_LIST_NAME = {"ru": "Покупки", "es": "Compras"}


def pick_language(language_code: str | None) -> str:
    """Map a Telegram ``language_code`` (e.g. ``es-MX``) to a supported UI language."""
    base = (language_code or "").lower().replace("_", "-").split("-")[0]
    return base if base in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


# System Category names (docs/ui-spec.md section 3.5), in display order.
SYSTEM_CATEGORY_NAMES = {
    "ru": [
        "Фрукты и овощи",
        "Хлеб",
        "Молочное",
        "Мясо и рыба",
        "Заморозка",
        "Бакалея",
        "Напитки",
        "Бытовая химия",
        "Гигиена",
        "Прочее",
    ],
    "es": [
        "Frutas y verduras",
        "Pan",
        "Lácteos",
        "Carne y pescado",
        "Congelados",
        "Despensa",
        "Bebidas",
        "Limpieza",
        "Higiene",
        "Otros",
    ],
}


def effective_language(language: str | None, language_code: str | None) -> str:
    """The user's chosen language if they set one, else the one Telegram suggests."""
    return language if language in SUPPORTED_LANGUAGES else pick_language(language_code)
