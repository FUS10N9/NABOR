-- Create profiles for auth users that existed before the profile trigger was installed.
insert into public.users (id, email, full_name)
select
  auth_user.id,
  auth_user.email,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(auth_user.email, 'neighbour'), '@', 1)
  )
from auth.users as auth_user
left join public.users as profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;
