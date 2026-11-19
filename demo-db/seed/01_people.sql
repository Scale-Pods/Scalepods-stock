-- The people who can be signed in as (ids match src/lib/demoAuth.ts).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@scalepods.demo'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin@scalepods.demo'),
  ('00000000-0000-4000-8000-0000000000a3', 'approver@scalepods.demo'),
  ('00000000-0000-4000-8000-0000000000a4', 'accounts@scalepods.demo'),
  ('00000000-0000-4000-8000-0000000000a5', 'viewer@scalepods.demo');

insert into public.staff (auth_user_id, full_name, email, role, job_title, primary_entity_id)
select v.id::uuid, v.name, v.email, v.role::public.app_role, v.title, (select id from public.entities where code = 'NPF')
from (values
  ('00000000-0000-4000-8000-0000000000a1', 'Aarav Mehta', 'owner@scalepods.demo', 'owner', 'Managing Partner'),
  ('00000000-0000-4000-8000-0000000000a2', 'Demo Admin', 'admin@scalepods.demo', 'admin', 'Operations Head'),
  ('00000000-0000-4000-8000-0000000000a3', 'Riya Shah', 'approver@scalepods.demo', 'approver', 'Sales Manager'),
  ('00000000-0000-4000-8000-0000000000a4', 'Kabir Nair', 'accounts@scalepods.demo', 'accounts', 'Accounts Executive'),
  ('00000000-0000-4000-8000-0000000000a5', 'Isha Verma', 'viewer@scalepods.demo', 'viewer', 'Trainee')
) as v(id, name, email, role, title);
