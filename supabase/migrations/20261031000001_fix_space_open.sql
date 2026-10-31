-- إصلاح: أول فتح لمساحة جديدة كان يرجع قيمًا فارغة لأن الإنشاء والقراءة كانا في نفس الجملة.
create or replace function public.space_open(p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid; s spaces;
begin
  sid := _space_id(p_key);
  select * into s from spaces where id = sid;
  return json_build_object('read_token', s.read_token, 'tz', s.tz, 'notify_hour', s.notify_hour);
end $$;

create or replace function public.space_settings(p_key text, p_tz text, p_hour int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid;
begin
  sid := _space_id(p_key);
  update spaces set tz = coalesce(nullif(p_tz, ''), tz), notify_hour = coalesce(p_hour, notify_hour)
  where id = sid;
end $$;
