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
  | "share"
  | "linkCopied"
  | "linkUnavailable"
  | "members"
  | "you"
  | "membersHint"
  | "badLinkTitle"
  | "badLinkHint"
  | "openMyLists";

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
    share: "Поделиться",
    linkCopied: "Ссылка скопирована",
    linkUnavailable: "Не удалось получить ссылку",
    members: "Участники",
    you: "вы",
    membersHint: "У всех участников одинаковые права. Отправьте ссылку, чтобы добавить ещё кого-то.",
    badLinkTitle: "Ссылка недействительна",
    badLinkHint: "Попросите прислать ссылку на список ещё раз.",
    openMyLists: "Открыть мои списки",
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
    share: "Compartir",
    linkCopied: "Enlace copiado",
    linkUnavailable: "No se pudo obtener el enlace",
    members: "Miembros",
    you: "tú",
    membersHint: "Todos los miembros tienen los mismos derechos. Envía el enlace para añadir a alguien más.",
    badLinkTitle: "El enlace no es válido",
    badLinkHint: "Pide que te envíen de nuevo el enlace de la lista.",
    openMyLists: "Abrir mis listas",
  },
};

export type Strings = Record<StringKey, string>;

/** Map a Telegram `language_code` (e.g. "es-MX") to a supported UI language. */
export function pickLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().replace("_", "-").split("-")[0];
  return base === "es" ? "es" : "ru";
}

export function t(lang: Language): Strings {
  return strings[lang];
}
