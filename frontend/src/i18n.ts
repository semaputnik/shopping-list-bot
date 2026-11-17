export type Language = "ru" | "es" | "en";

type StringKey =
  | "loading"
  | "emptyTitle"
  | "emptyHint"
  | "errorTitle"
  | "errorHint"
  | "retry"
  | "offline"
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
  | "entryName"
  | "entryNameHint"
  | "entryDetails"
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
  | "listLeftNotice"
  | "suggestions"
  | "alreadyOnList"
  | "addNew"
  | "forgetProduct"
  | "forgetConfirm"
  | "shareList"
  | "shareText"
  | "remaining"
  | "progress"
  | "allInBasket"
  | "boughtSaved"
  | "doneTitle"
  | "doneHint"
  | "andMore"
  | "uncheckAll"
  | "checkFailed"
  | "bought"
  | "buyFailed"
  | "undoBuyFailed"
  | "history"
  | "historyEmpty"
  | "historyAdded"
  | "historyAddFailed"
  | "historyAddBack"
  | "historyLoadFailed";

const strings: Record<Language, Record<StringKey, string>> = {
  ru: {
    loading: "Загрузка…",
    emptyTitle: "Список пуст",
    emptyHint: "Здесь появятся товары, которые нужно купить. Или добавьте популярное:",
    errorTitle: "Не удалось войти",
    errorHint: "Закройте приложение и откройте его снова из Telegram.",
    retry: "Повторить",
    offline: "Нет сети. Изменения не сохранятся, пока связь не вернётся.",
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
    loadFailed: "Не удалось обновить список.",
    emptyInputHint: "Напишите название и отправьте. Через запятую — заметка: молоко, 2 л.",
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
    entryName: "Название",
    entryNameHint: "Меняется у товара целиком: во всех его строках и подсказках.",
    entryNotePlaceholder: "Количество или детали",
    entryCategory: "Отдел",
    entryAddedBy: "Добавлено:",
    entryDelete: "Удалить",
    entryDeleted: "Удалено",
    undo: "Отменить",
    close: "Закрыть",
    entryDetails: "Подробнее",
    entrySaveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    entryDeleteFailed: "Не удалось удалить. Попробуйте ещё раз.",
    undoFailed: "Не удалось вернуть позицию.",
    listDeletedNotice: "Список «{name}» удалён",
    listLeftNotice: "Вы больше не участник списка «{name}»",
    suggestions: "Подсказки",
    alreadyOnList: "уже в списке",
    addNew: "Добавить",
    forgetProduct: "Убрать из подсказок",
    forgetConfirm: "Убрать",
    shareList: "Поделиться списком",
    shareText: "Присоединяйтесь к списку «{name}»",
    remaining: "Осталось: {n}",
    progress: "Осталось купить: {left} из {total}",
    allInBasket: "Всё в корзине — нажмите «Куплено»",
    boughtSaved: "в истории",
    doneTitle: "Всё куплено",
    doneHint: "Покупка сохранена в истории.",
    andMore: "и ещё {n}",
    uncheckAll: "Снять все отметки",
    checkFailed: "Отметка не сохранилась. Проверьте связь.",
    bought: "Куплено",
    buyFailed: "Покупка не сохранилась. Проверьте связь.",
    undoBuyFailed: "Не удалось отменить покупку. Проверьте связь.",
    history: "История покупок",
    historyEmpty: "Пока пусто. Здесь появятся покупки после нажатия «Куплено».",
    historyAdded: "Добавлено в список",
    historyAddFailed: "Не удалось добавить. Попробуйте ещё раз.",
    historyAddBack: "Добавить в список снова",
    historyLoadFailed: "Не удалось загрузить историю.",
  },
  es: {
    loading: "Cargando…",
    emptyTitle: "La lista está vacía",
    emptyHint: "Aquí aparecerán los productos que hay que comprar. O añade algo popular:",
    errorTitle: "No se pudo iniciar sesión",
    errorHint: "Cierra la aplicación y ábrela de nuevo desde Telegram.",
    retry: "Reintentar",
    offline: "Sin conexión. Los cambios no se guardarán hasta que vuelva la red.",
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
    loadFailed: "No se pudo actualizar la lista.",
    emptyInputHint: "Escribe el nombre y envíalo. Tras una coma va la nota: leche, 2 l.",
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
    entryName: "Nombre",
    entryNameHint: "Cambia en todo el producto: en todas sus filas y sugerencias.",
    entryNotePlaceholder: "Cantidad o detalles",
    entryCategory: "Sección",
    entryAddedBy: "Añadido por:",
    entryDelete: "Eliminar",
    entryDeleted: "Eliminado",
    undo: "Deshacer",
    close: "Cerrar",
    entryDetails: "Detalles",
    entrySaveFailed: "No se pudo guardar. Inténtalo de nuevo.",
    entryDeleteFailed: "No se pudo eliminar. Inténtalo de nuevo.",
    undoFailed: "No se pudo recuperar el producto.",
    listDeletedNotice: "La lista «{name}» fue eliminada",
    listLeftNotice: "Ya no eres miembro de la lista «{name}»",
    suggestions: "Sugerencias",
    alreadyOnList: "ya está en la lista",
    addNew: "Añadir",
    forgetProduct: "Quitar de las sugerencias",
    forgetConfirm: "Quitar",
    shareList: "Compartir la lista",
    shareText: "Únete a la lista «{name}»",
    remaining: "Quedan: {n}",
    progress: "Por comprar: {left} de {total}",
    allInBasket: "Todo en la cesta: pulsa «Comprado»",
    boughtSaved: "en el historial",
    doneTitle: "Todo comprado",
    doneHint: "La compra se guardó en el historial.",
    andMore: "y {n} más",
    uncheckAll: "Quitar todas las marcas",
    checkFailed: "La marca no se guardó. Revisa la conexión.",
    bought: "Comprado",
    buyFailed: "La compra no se guardó. Revisa la conexión.",
    undoBuyFailed: "No se pudo deshacer la compra. Revisa la conexión.",
    history: "Historial de compras",
    historyEmpty: "Aún no hay nada. Las compras aparecerán aquí al pulsar «Comprado».",
    historyAdded: "Añadido a la lista",
    historyAddFailed: "No se pudo añadir. Inténtalo de nuevo.",
    historyAddBack: "Volver a añadir a la lista",
    historyLoadFailed: "No se pudo cargar el historial.",
  },
  en: {
    loading: "Loading…",
    emptyTitle: "The list is empty",
    emptyHint: "Things to buy will show up here. Or add something popular:",
    errorTitle: "Couldn't sign in",
    errorHint: "Close the app and open it again from Telegram.",
    retry: "Retry",
    offline: "No connection. Changes won't be saved until you're back online.",
    notTelegramTitle: "Open in Telegram",
    notTelegramHint: "Shared Lists works as a mini app inside Telegram.",
    noList: "No lists available",
    switchList: "Your lists",
    newList: "New list",
    createList: "Create",
    listName: "List name",
    listNamePlaceholder: "For example, Weekend at the cabin",
    save: "Save",
    cancel: "Cancel",
    listMenu: "List actions",
    renameList: "Rename",
    leaveList: "Leave list",
    deleteList: "Delete list",
    leaveTitle: "Leave the list?",
    leaveMessage: "The list disappears only for you; the other members keep it.",
    leaveLastMessage: "You're the last member: the list will be deleted.",
    deleteTitle: "Delete the list?",
    deleteMessage:
      "The list will be deleted for all {n} members, together with its history. This can't be undone.",
    membersCount: "Members: {n}",
    actionFailed: "That didn't work. Try again.",
    inputPlaceholder: "Add to the list",
    inputLabel: "What to buy",
    addFailed: "Couldn't add. Try again.",
    loadFailed: "Couldn't update the list.",
    emptyInputHint: "Type a name and send it. A comma starts a note: milk, 2 l.",
    share: "Share",
    linkCopied: "Link copied",
    linkUnavailable: "Couldn't get the link",
    members: "Members",
    you: "you",
    membersHint: "Every member has the same rights. Send the link to add someone else.",
    badLinkTitle: "The link isn't valid",
    badLinkHint: "Ask for the list's link again.",
    openMyLists: "Open my lists",
    settings: "Settings",
    languageSection: "Language",
    languageAsTelegram: "Same as Telegram",
    languageSaveError: "Couldn't save the language. Try again.",
    entryNote: "Note",
    entryName: "Name",
    entryNameHint: "Changes the whole item: every row of it and its suggestions.",
    entryNotePlaceholder: "Amount or details",
    entryCategory: "Section",
    entryAddedBy: "Added by:",
    entryDelete: "Delete",
    entryDeleted: "Deleted",
    undo: "Undo",
    close: "Close",
    entryDetails: "Details",
    entrySaveFailed: "Couldn't save. Try again.",
    entryDeleteFailed: "Couldn't delete. Try again.",
    undoFailed: "Couldn't bring the item back.",
    listDeletedNotice: "The list “{name}” was deleted",
    listLeftNotice: "You're no longer a member of “{name}”",
    suggestions: "Suggestions",
    alreadyOnList: "already on the list",
    addNew: "Add",
    forgetProduct: "Remove from suggestions",
    forgetConfirm: "Remove",
    shareList: "Share list",
    shareText: "Join the list “{name}”",
    remaining: "Left: {n}",
    progress: "Left to buy: {left} of {total}",
    allInBasket: "Everything's in the basket — tap “Bought”",
    boughtSaved: "saved to history",
    doneTitle: "All bought",
    doneHint: "The purchase is saved to history.",
    andMore: "and {n} more",
    uncheckAll: "Uncheck all",
    checkFailed: "The check wasn't saved. Check your connection.",
    bought: "Bought",
    buyFailed: "The purchase wasn't saved. Check your connection.",
    undoBuyFailed: "Couldn't undo the purchase. Check your connection.",
    history: "Purchase history",
    historyEmpty: "Nothing yet. Purchases show up here when you tap “Bought”.",
    historyAdded: "Added to the list",
    historyAddFailed: "Couldn't add. Try again.",
    historyAddBack: "Add back to the list",
    historyLoadFailed: "Couldn't load the history.",
  },
};

/** Popular items offered as quick-add buttons on an empty List. */
export const QUICK_ADD: Record<Language, string[]> = {
  ru: ["Молоко", "Хлеб", "Яйца", "Бананы", "Картошка", "Сыр", "Курица", "Вода"],
  es: ["Leche", "Pan", "Huevos", "Plátanos", "Patatas", "Queso", "Pollo", "Agua"],
  en: ["Milk", "Bread", "Eggs", "Bananas", "Potatoes", "Cheese", "Chicken", "Water"],
};

/** Each language is always shown in its own name, whatever the interface language is. */
export const LANGUAGE_NAMES: Record<Language, string> = { ru: "Русский", es: "Español", en: "English" };

export type Strings = Record<StringKey, string>;

/** Fills the `{n}` placeholder of a string. */
export function withCount(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

/** Map a Telegram `language_code` (e.g. "es-MX") to a supported UI language. */
export function pickLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().replace("_", "-").split("-")[0];
  // A language we do not speak falls back to English (the backend does the same).
  return base === "ru" || base === "es" ? base : "en";
}

export function t(lang: Language): Strings {
  return strings[lang];
}
