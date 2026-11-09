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
  | "actionFailed";

const strings: Record<Language, Record<StringKey, string>> = {
  ru: {
    loading: "Загрузка…",
    emptyTitle: "Список пуст",
    emptyHint: "Здесь появятся товары, которые нужно купить.",
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
  },
  es: {
    loading: "Cargando…",
    emptyTitle: "La lista está vacía",
    emptyHint: "Aquí aparecerán los productos que hay que comprar.",
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
  },
};

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
