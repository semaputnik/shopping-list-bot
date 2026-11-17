import { useEffect, useState } from "react";
import { Button, Cell, List, Section, Snackbar, Title } from "@telegram-apps/telegram-ui";
import { fetchInvite, type ShoppingList, type User } from "../api";
import { Avatar, memberName } from "../components/Avatar";
import type { Strings } from "../i18n";
import { shareList } from "../share";
import { bindBackButton, haptic } from "../telegram";

interface Props {
  token: string;
  user: User;
  list: ShoppingList;
  strings: Strings;
  onBack: () => void;
}

/** The Members screen: everyone with access to the List, and the Share button. */
export function MembersScreen({ token, user, list, strings, onBack }: Props) {
  const [info, setInfo] = useState<string | null>(null);
  // Leaving a nested screen is Telegram's native BackButton (also the Android back press).
  useEffect(() => bindBackButton(onBack), [onBack]);

  const share = async () => {
    const result = await shareList(
      async () => (await fetchInvite(token, list.id)).url,
      strings.shareText.replace("{name}", list.name),
    );
    if (result === "unavailable") haptic.error();
    else haptic.success();
    if (result === "shared") return; // Telegram's own picker is the feedback
    setInfo(result === "copied" ? strings.linkCopied : strings.linkUnavailable);
  };

  return (
    <main className="screen">
      <Title level="1" weight="1" className="screen__title">
        {strings.members}
      </Title>
      <List className="plain-list">
        <Section footer={strings.membersHint}>
          {list.members.map((member) => (
            <Cell
              key={member.id}
              before={<Avatar member={member} size="lg" />}
              subtitle={member.username ? `@${member.username}` : undefined}
              multiline
            >
              {memberName(member)}
              {member.id === user.id && <span className="hint"> · {strings.you}</span>}
            </Cell>
          ))}
        </Section>
        <Button size="l" mode="filled" stretched onClick={() => void share()}>
          {strings.share}
        </Button>
      </List>
      {info && (
        <Snackbar key={info} className="snackbar" duration={2500} onClose={() => setInfo(null)}>
          {info}
        </Snackbar>
      )}
    </main>
  );
}
