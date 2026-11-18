insert into public.platform_role_invites(email, role)
values ('agroeioficial@gmail.com', 'agroei_owner')
on conflict (email) do nothing;

insert into public.platform_roles(user_id, role)
select id, 'agroei_owner'::public.platform_role from auth.users
where lower(email) = 'agroeioficial@gmail.com' and email_confirmed_at is not null
on conflict (user_id, role) do nothing;