import { lazy } from "react";

/*
 * Screens and sheets the List screen opens on demand, split out of the start-up bundle: the
 * drawers (vaul, Radix) and the secondary screens are not needed to show the List. They are
 * fetched in the background once the List is up (prefetchScreens), so a first tap rarely waits.
 */
const loadSheet = () => import("./Sheet");
const loaders = [
  () => import("./EntryScreen"),
  () => import("./ListsScreen"),
  () => import("./StoresScreen"),
  () => import("./HistoryScreen"),
  () => import("./MembersScreen"),
  () => import("./SettingsScreen"),
  loadSheet,
];

export const EntryScreen = lazy(() => import("./EntryScreen").then((m) => ({ default: m.EntryScreen })));
export const ListsScreen = lazy(() => import("./ListsScreen").then((m) => ({ default: m.ListsScreen })));
export const StoresScreen = lazy(() =>
  import("./StoresScreen").then((m) => ({ default: m.StoresScreen })),
);
export const HistoryScreen = lazy(() =>
  import("./HistoryScreen").then((m) => ({ default: m.HistoryScreen })),
);
export const MembersScreen = lazy(() =>
  import("./MembersScreen").then((m) => ({ default: m.MembersScreen })),
);
export const SettingsScreen = lazy(() =>
  import("./SettingsScreen").then((m) => ({ default: m.SettingsScreen })),
);
export const NameSheet = lazy(() => loadSheet().then((m) => ({ default: m.NameSheet })));

let prefetched = false;

/** Warms the split chunks once, when the browser is idle after the List has rendered. */
export function prefetchScreens(): void {
  if (prefetched) return;
  prefetched = true;
  const run = () => loaders.forEach((load) => void load().catch(() => {}));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
