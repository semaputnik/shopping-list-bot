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
  | "switchList"
  | "newList"
  | "createList"
  | "listName"
  | "listNamePlaceholder"
  | "save"
  | "cancel"
  | "listMenu"
  | "renameList"
  | "leaveList"
  | "deleteList"
  | "leaveTitle"
  | "leaveMessage"
  | "leaveLastMessage"
  | "deleteTitle"
  | "deleteMessage"
  | "membersCount"
  | "actionFailed"
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
  | "languageSaveError"
  | "entryNote"
  | "entryNotePlaceholder"
  | "entryCategory"
  | "entryAddedBy"
  | "entryDelete"
  | "entryDeleted"
  | "undo"
  | "close"
  | "entrySaveFailed"
  | "entryDeleteFailed"
  | "undoFailed"
  | "listDeletedNotice"
  | "suggestions"
  | "alreadyOnList"
  | "addNew"
  | "forgetProduct"
  | "menu"
  | "uncheckAll"
  | "checkFailed"
  | "bought"
  | "buyFailed"
  | "undoBuyFailed";

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
    switchList: "Ваши списки",
    newList: "Новый список",
    createList: "Создать",
    listName: "Название списка",
    listNamePlaceholder: "Например, Дача",
    save: "Сохранить",
    cancel: "Отмена",
    listMenu: "Действия со списком",
    renameList: "Переименовать",
    leaveList: "Покинуть список",
    deleteList: "Удалить список",
    leaveTitle: "Покинуть список?",
    leaveMessage: "Список исчезнет только у вас, у остальных участников он останется.",
    leaveLastMessage: "Вы последний участник: список будет удалён.",
    deleteTitle: "Удалить список?",
    deleteMessage:
      "Список удалится у всех участников ({n}) вместе с историей. Восстановить его будет нельзя.",
    membersCount: "Участников: {n}",
    actionFailed: "Не получилось. Попробуйте ещё раз.",
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
    entryNote: "Заметка",
    entryNotePlaceholder: "Количество или детали",
    entryCategory: "Отдел",
    entryAddedBy: "Добавил(а)",
    entryDelete: "Удалить",
    entryDeleted: "Удалено",
    undo: "Отменить",
    close: "Закрыть",
    entrySaveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    entryDeleteFailed: "Не удалось удалить. Попробуйте ещё раз.",
    undoFailed: "Не удалось вернуть позицию.",
    listDeletedNotice: "Список «{name}» удалён",
    suggestions: "Подсказки",
    alreadyOnList: "уже в списке",
    addNew: "Добавить",
    forgetProduct: "Убрать из подсказок",
    menu: "Меню",
    uncheckAll: "Снять все отметки",
    checkFailed: "Не удалось сохранить отметку. Список обновлён.",
    bought: "Куплено",
    buyFailed: "Не удалось отметить покупку. Список обновлён.",
    undoBuyFailed: "Не удалось отменить покупку. Список обновлён.",
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
    switchList: "Tus listas",
    newList: "Nueva lista",
    createList: "Crear",
    listName: "Nombre de la lista",
    listNamePlaceholder: "Por ejemplo, Casa de campo",
    save: "Guardar",
    cancel: "Cancelar",
    listMenu: "Acciones de la lista",
    renameList: "Renombrar",
    leaveList: "Salir de la lista",
    deleteList: "Eliminar lista",
    leaveTitle: "¿Salir de la lista?",
    leaveMessage: "La lista desaparecerá solo para ti; los demás miembros la conservan.",
    leaveLastMessage: "Eres el último miembro: la lista se eliminará.",
    deleteTitle: "¿Eliminar la lista?",
    deleteMessage:
      "La lista se eliminará para todos los miembros ({n}), con su historial. No se puede recuperar.",
    membersCount: "Miembros: {n}",
    actionFailed: "No se pudo. Inténtalo de nuevo.",
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
    entryNote: "Nota",
    entryNotePlaceholder: "Cantidad o detalles",
    entryCategory: "Sección",
    entryAddedBy: "Añadido por",
    entryDelete: "Eliminar",
    entryDeleted: "Eliminado",
    undo: "Deshacer",
    close: "Cerrar",
    entrySaveFailed: "No se pudo guardar. Inténtalo de nuevo.",
    entryDeleteFailed: "No se pudo eliminar. Inténtalo de nuevo.",
    undoFailed: "No se pudo recuperar el producto.",
    listDeletedNotice: "La lista «{name}» fue eliminada",
    suggestions: "Sugerencias",
    alreadyOnList: "ya está en la lista",
    addNew: "Añadir",
    forgetProduct: "Quitar de las sugerencias",
    menu: "Menú",
    uncheckAll: "Quitar todas las marcas",
    checkFailed: "No se pudo guardar la marca. Lista actualizada.",
    bought: "Comprado",
    buyFailed: "No se pudo registrar la compra. Lista actualizada.",
    undoBuyFailed: "No se pudo deshacer la compra. Lista actualizada.",
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

/** Fills the `{n}` placeholder of a string. */
export function withCount(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

/** Map a Telegram `language_code` (e.g. "es-MX") to a supported UI language. */
export function pickLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().replace("_", "-").split("-")[0];
  return base === "es" ? "es" : "ru";
}

export function t(lang: Language): Strings {
  return strings[lang];
}
