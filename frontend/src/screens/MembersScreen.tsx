import { useEffect, useRef, useState } from "react";
import type { ShoppingList, User } from "../api";
import { Avatar, memberName } from "../components/Avatar";
import type { Strings } from "../i18n";
import { shareList } from "../share";
import { bindBackButton, haptic } from "../telegram";

interface Props {
  user: User;
  list: ShoppingList;
  strings: Strings;
  onBack: () => void;
}

/** The Members screen: everyone with access to the List, and the Share button. */
export function MembersScreen({ user, list, strings, onBack }: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Leaving a nested screen is Telegram's native BackButton (also the Android back press).
  useEffect(() => bindBackButton(onBack), [onBack]);

  const share = async () => {
    const result = await shareList(list.share_url, strings.shareText.replace("{name}", list.name));
    if (result === "unavailable") haptic.error();
    else haptic.success();
    if (result === "shared") return; // Telegram's own picker is the feedback
    setToast(result === "copied" ? strings.linkCopied : strings.linkUnavailable);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <main className="screen">
      <h1 className="screen__title">{strings.members}</h1>
      <ul className="members">
        {list.members.map((member) => (
          <li key={member.id} className="members__row">
            <Avatar member={member} size="lg" />
            <span className="members__name">
              <span className="members__line">
                {memberName(member)}
                {member.id === user.id && <span className="members__you"> · {strings.you}</span>}
              </span>
              {member.username && <span className="members__username">@{member.username}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="message__action share-button" onClick={() => void share()}>
        {strings.share}
      </button>
      <p className="members__hint">{strings.membersHint}</p>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
