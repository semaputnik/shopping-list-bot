import { useEffect, useState } from "react";
import { Button, Cell, List, Section, Snackbar, Title } from "@telegram-apps/telegram-ui";
import { resetInvite, type Member, type ShoppingList, type User } from "../api";
import { Avatar, memberName } from "../components/Avatar";
import type { Strings } from "../i18n";
import { shareList } from "../share";
import { bindBackButton, confirmDestructive, haptic } from "../telegram";

interface Props {
  token: string;
  user: User;
  list: ShoppingList;
  strings: Strings;
  onBack: () => void;
}

/** «пригласил(а) Анна · @carlos»: who invited them, then their username; either may be missing. */
function memberSubtitle(member: Member, strings: Strings): string | undefined {
  const parts = [
    member.invited_by && strings.invitedBy.replace("{name}", memberName(member.invited_by)),
    member.username && `@${member.username}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** The Members screen: everyone with access to the List, and the Share button. */
export function MembersScreen({ token, user, list, strings, onBack }: Props) {
  const [info, setInfo] = useState<string | null>(null);
  // Leaving a nested screen is Telegram's native BackButton (also the Android back press).
  useEffect(() => bindBackButton(onBack), [onBack]);

  const share = async () => {
    const result = await shareList(token, list, strings.shareText.replace("{name}", list.name));
    if (result === "unavailable") haptic.error();
    else haptic.success();
    if (result === "shared") return; // Telegram's own picker is the feedback
    setInfo(result === "copied" ? strings.linkCopied : strings.linkUnavailable);
  };

  const reset = async () => {
    const ok = await confirmDestructive({
      title: strings.resetLinkTitle,
      message: strings.resetLinkMessage,
      confirmLabel: strings.resetLinkConfirm,
    });
    if (!ok) return;
    try {
      await resetInvite(token, list.id);
      haptic.success();
      setInfo(strings.linkReset);
    } catch {
      haptic.error();
      setInfo(strings.actionFailed);
    }
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
              subtitle={memberSubtitle(member, strings)}
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
        <Section>
          <Cell className="cell--destructive" onClick={() => void reset()}>
            {strings.resetLink}
          </Cell>
        </Section>
      </List>
      {info && (
        <Snackbar key={info} className="snackbar" duration={2500} onClose={() => setInfo(null)}>
          {info}
        </Snackbar>
      )}
    </main>
  );
}
