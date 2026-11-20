<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## SMART POUPA — regras técnicas do projeto

- Data security lives in the database: every group-owned table has RLS with SELECT-only policies and no direct write grants; all writes go through `SECURITY DEFINER` RPCs that check the caller's group role and append to `audit_log`. Why: the spec requires server-side isolation, never UI-only hiding.
- Every group-owned row carries `group_id`; role checks use the helper functions (`has_group_role`, `is_group_admin`, `can_manage_members`, `is_active_member`). Why: one isolation rule reused by every policy and RPC.
- Sensitive member data (email, ID document, birth date, address) lives only in `member_private_data`, separate from the shareable `group_members` row. Why: Postgres RLS is row-level, so column privacy needs a separate table.
- Platform roles (AGROEI) live in `platform_roles`, group roles in `group_member_roles`; never store roles on profiles. Why: prevents privilege escalation.
- Confirmed records are never physically deleted; members change status instead. Why: audit and integrity rules of the spec.
- `src/lib/roles.ts` mirrors the database permission rules for the UI only; keep both in sync and cover changes in `src/test/roles.test.ts` and `scripts/test-rls-fase1.ts` (live DB isolation test with throwaway `@exemplo.test` accounts).
- The signed-in area is `src/routes/_authenticated/` (client-only, `ssr: false`); reads use the browser Supabase client under RLS. Why: the session lives in browser storage.
- Accounts are created only through invitations: `src/lib/invites.functions.ts` checks the caller's role with their own session, then uses the service-role client to send the Supabase invite (new person) or magic link (existing account) to `/convite`, which accepts pending invites and asks only for a password. There is no public sign-up screen. Why: the group's administration registers members; members never create accounts.
- Server functions get the browser session through `src/lib/auth-attacher.ts`, registered as `functionMiddleware` in `src/start.ts`. Why: `requireSupabaseAuth` needs the bearer token.
