drop policy if exists "member_private_data_select" on public.member_private_data;
create policy "member_private_data_select" on public.member_private_data for select to authenticated using (
  public.is_own_member(auth.uid(), member_id)
  or public.is_group_admin(auth.uid(), group_id)
);

create index if not exists admin_role_history_member_idx on public.admin_role_history(member_id);
create index if not exists member_status_request_votes_voter_idx on public.member_status_request_votes(voter_member_id);
create index if not exists member_status_requests_requested_by_member_idx on public.member_status_requests(requested_by_member);