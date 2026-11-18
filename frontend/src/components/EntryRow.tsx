import { memo } from "react";
import { Cell } from "@telegram-apps/telegram-ui";
import type { Entry, Member } from "../api";
import { EntryAvatar } from "./Avatar";

interface Props {
  entry: Entry;
  /** Just added: plays the arrival wash. */
  isNew: boolean;
  /** The List's Members, shown as the adder's avatar when the List is shared. */
  members: Member[];
  /** The Entry's Category emoji, shown in the Store grouping; undefined in the Category one. */
  categoryEmoji: string | undefined;
  /** Accessible name prefix of the chevron («Подробнее»). */
  detailsLabel: string;
  onToggle: (id: number, checked: boolean) => void;
  onOpen: (id: number) => void;
}

/**
 * One Entry on the List screen. Memoised: typing in the input line or checking one row re-renders
 * only the rows whose props changed, not the whole List (the callbacks must be stable).
 */
export const EntryRow = memo(function EntryRow({
  entry,
  isNew,
  members,
  categoryEmoji,
  detailsLabel,
  onToggle,
  onOpen,
}: Props) {
  return (
    <div
      className={["row", entry.checked && "row--checked", isNew && "row--new"]
        .filter(Boolean)
        .join(" ")}
    >
      {/* The whole row is the tap target for the aisle action (check / uncheck);
          the trailing chevron is the separate, visible way into the Entry card. */}
      <Cell
        Component="button"
        type="button"
        role="checkbox"
        aria-checked={entry.checked}
        className="row__toggle"
        multiline
        before={<span className="row__check" aria-hidden="true" />}
        subtitle={entry.note ? <span className="row__note">{entry.note}</span> : undefined}
        after={
          members.length > 1 ? (
            <span className="row__by" aria-hidden="true">
              <EntryAvatar members={members} addedBy={entry.added_by} />
            </span>
          ) : undefined
        }
        onClick={() => onToggle(entry.id, !entry.checked)}
      >
        {categoryEmoji !== undefined && (
          <span className="row__category" aria-hidden="true">
            {categoryEmoji}
          </span>
        )}
        <span className="row__label">{entry.name}</span>
      </Cell>
      <button
        type="button"
        className="row__open"
        aria-label={`${detailsLabel}: ${entry.name}`}
        onClick={() => onOpen(entry.id)}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
});
