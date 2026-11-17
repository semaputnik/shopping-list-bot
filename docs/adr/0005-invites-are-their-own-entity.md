# Invites are their own entity, one per Member and List

A List used to carry one secret `share_code` that every Member passed around, so nobody could say who brought whom in, and the only way to stop a leaked link was to lose it for everyone. A Share link now comes from an `invite` row: the List, a unique random code, who created it, when, and `revoked_at`. Each (Member, List) has one active Invite, created on first request (`GET /api/lists/{id}/invite`) and replaced by «Сбросить ссылку» (`POST …/invite/reset`), which revokes the old code. `list_member.invite_id` records the Invite a Member joined through, and the Members API shows its creator as `invited_by`.

The link payload says what it is: `https://t.me/<bot>?startapp=join_<code>`. Join and sign-in accept that and legacy bare codes, so links already shared keep working: the migration turned every `share_code` into an Invite created by the List's creator, code unchanged. A revoked or unknown code is the same bad-link case as before. Revoking an Invite never removes Members who already joined through it.

We rejected one shared code with a reset button on the List (no attribution, and one Member's reset breaks everyone's link) and expiring Invites (not needed yet).
