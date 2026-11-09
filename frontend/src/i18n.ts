export type Language = "ru" | "es";

type StringKey =
  | "loading"
  | "emptyTitle"
  | "emptyHint"
  | "errorTitle"
  | "errorHint"
  | "retry"
  | "notTelegramTitle"
  | "notTelegramHint"
  | "noList"
  | "inputPlaceholder"
  | "inputLabel"
  | "addFailed"
  | "loadFailed"
  | "emptyInputHint"
  | "share"
  | "linkCopied"
  | "linkUnavailable"
  | "members"
  | "you"
  | "membersHint"
  | "badLinkTitle"
  | "badLinkHint"
  | "openMyLists"
  | "settings"
  | "languageSection"
  | "languageAsTelegram"
  | "languageSaveError";

const strings: Record<Language, Record<StringKey, string>> = {
  ru: {
    loading: "Загрузка…",
    emptyTitle: "Список пуст",
    emptyHint: "Здесь появятся товары, которые нужно купить. Или добавьте популярное:",
    errorTitle: "Не удалось войти",
    errorHint: "Закройте приложение и откройте его снова из Telegram.",
    retry: "Повторить",
    notTelegramTitle: "Откройте в Telegram",
    notTelegramHint: "Shared Lists работает как мини-приложение внутри Telegram.",
    noList: "Нет доступных списков",
    inputPlaceholder: "Добавить в список",
    inputLabel: "Что нужно купить",
    addFailed: "Не удалось добавить. Попробуйте ещё раз.",
    loadFailed: "Не удалось обновить список. Откройте его заново.",
    emptyInputHint: "Напишите название и нажмите Enter. Через запятую — заметка: молоко, 2 л.",
    share: "Поделиться",
    linkCopied: "Ссылка скопирована",
    linkUnavailable: "Не удалось получить ссылку",
    members: "Участники",
    you: "вы",
    membersHint: "У всех участников одинаковые права. Отправьте ссылку, чтобы добавить ещё кого-то.",
    badLinkTitle: "Ссылка недействительна",
    badLinkHint: "Попросите прислать ссылку на список ещё раз.",
    openMyLists: "Открыть мои списки",
    settings: "Настройки",
    languageSection: "Язык",
    languageAsTelegram: "Как в Telegram",
    languageSaveError: "Не удалось сохранить язык. Попробуйте ещё раз.",
  },
  es: {
    loading: "Cargando…",
    emptyTitle: "La lista está vacía",
    emptyHint: "Aquí aparecerán los productos que hay que comprar. O añade algo popular:",
    errorTitle: "No se pudo iniciar sesión",
    errorHint: "Cierra la aplicación y ábrela de nuevo desde Telegram.",
    retry: "Reintentar",
    notTelegramTitle: "Abre en Telegram",
    notTelegramHint: "Shared Lists funciona como mini aplicación dentro de Telegram.",
    noList: "No hay listas disponibles",
    inputPlaceholder: "Añadir a la lista",
    inputLabel: "Qué hay que comprar",
    addFailed: "No se pudo añadir. Inténtalo de nuevo.",
    loadFailed: "No se pudo actualizar la lista. Ábrela de nuevo.",
    emptyInputHint: "Escribe el nombre y pulsa Enter. Tras una coma va la nota: leche, 2 l.",
    share: "Compartir",
    linkCopied: "Enlace copiado",
    linkUnavailable: "No se pudo obtener el enlace",
    members: "Miembros",
    you: "tú",
    membersHint: "Todos los miembros tienen los mismos derechos. Envía el enlace para añadir a alguien más.",
    badLinkTitle: "El enlace no es válido",
    badLinkHint: "Pide que te envíen de nuevo el enlace de la lista.",
    openMyLists: "Abrir mis listas",
    settings: "Ajustes",
    languageSection: "Idioma",
    languageAsTelegram: "Como en Telegram",
    languageSaveError: "No se pudo guardar el idioma. Inténtalo de nuevo.",
  },
};

/** Popular items offered as quick-add buttons on an empty List. */
export const QUICK_ADD: Record<Language, string[]> = {
  ru: ["Молоко", "Хлеб", "Яйца", "Бананы", "Картошка", "Сыр", "Курица", "Вода"],
  es: ["Leche", "Pan", "Huevos", "Plátanos", "Patatas", "Queso", "Pollo", "Agua"],
};

/** Each language is always shown in its own name, whatever the interface language is. */
export const LANGUAGE_NAMES: Record<Language, string> = { ru: "Русский", es: "Español" };

export type Strings = Record<StringKey, string>;

/** Map a Telegram `language_code` (e.g. "es-MX") to a supported UI language. */
export function pickLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().replace("_", "-").split("-")[0];
  return base === "es" ? "es" : "ru";
}

export function t(lang: Language): Strings {
  return strings[lang];
}
