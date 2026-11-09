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
  | "settings"
  | "back"
  | "languageSection"
  | "languageAsTelegram"
  | "languageSaveError";

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
    settings: "Настройки",
    back: "Назад",
    languageSection: "Язык",
    languageAsTelegram: "Как в Telegram",
    languageSaveError: "Не удалось сохранить язык. Попробуйте ещё раз.",
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
    settings: "Ajustes",
    back: "Atrás",
    languageSection: "Idioma",
    languageAsTelegram: "Como en Telegram",
    languageSaveError: "No se pudo guardar el idioma. Inténtalo de nuevo.",
  },
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
