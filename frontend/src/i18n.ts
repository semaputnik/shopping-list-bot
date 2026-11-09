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
  | "emptyInputHint";

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
    loadFailed: "Не удалось обновить список. Потяните вниз или откройте заново.",
    emptyInputHint: "Напишите название и нажмите Enter. Через запятую — заметка: молоко, 2 л.",
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
  },
};

/** Popular items offered as quick-add buttons on an empty List. */
export const QUICK_ADD: Record<Language, string[]> = {
  ru: ["Молоко", "Хлеб", "Яйца", "Бананы", "Картошка", "Сыр", "Курица", "Вода"],
  es: ["Leche", "Pan", "Huevos", "Plátanos", "Patatas", "Queso", "Pollo", "Agua"],
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
