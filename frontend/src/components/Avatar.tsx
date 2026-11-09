import { useState } from "react";
import type { Member } from "../api";

/** Up to this many avatars show in the header row; the rest collapse into «+N». */
export const MAX_HEADER_AVATARS = 4;

function initials(member: Member): string {
  const letters = [member.first_name, member.last_name].map((s) => (s ?? "").trim()[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function memberName(member: Member): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ");
}

/** A round avatar: the Telegram photo, or initials when there is none or it fails to load. */
export function Avatar({ member, size = "md" }: { member: Member; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  const className = `avatar avatar--${size}`;
  if (member.photo_url && !broken) {
    return (
      <img
        className={className}
        src={member.photo_url}
        alt={memberName(member)}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`${className} avatar--initials`} role="img" aria-label={memberName(member)}>
      {initials(member)}
    </span>
  );
}

/** Overlapping avatars of the List's Members: up to 4, then «+N». */
export function AvatarStack({ members }: { members: Member[] }) {
  const shown = members.slice(0, MAX_HEADER_AVATARS);
  const extra = members.length - shown.length;
  return (
    <span className="avatars">
      {shown.map((member) => (
        <Avatar key={member.id} member={member} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar--md avatar--more" aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}

/**
 * The avatar of the Member who added an Entry, shown on its row only when the List has
 * more than one Member. Entry rows (a later ticket) render this with the Entry's `added_by`.
 */
export function EntryAvatar({ members, addedBy }: { members: Member[]; addedBy: number | null }) {
  if (members.length < 2) return null;
  const member = members.find((m) => m.id === addedBy);
  return member ? <Avatar member={member} size="sm" /> : null;
}
