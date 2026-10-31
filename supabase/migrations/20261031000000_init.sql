-- بدّلها — قاعدة البيانات
-- كل جهاز يحمل "مفتاح مساحة" سري (لا يُخزَّن هنا إلا مُجزّأً بـ sha256).
-- الجداول مقفلة تمامًا عن العامة؛ الوصول فقط عبر دوال RPC تتحقق من المفتاح.

create extension if not exists pgcrypto with schema extensions;

create sequence if not exists public.item_rev;

create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  key_hash    text unique not null,
  read_token  text unique not null default encode(extensions.gen_random_bytes(18), 'hex'),
  tz          text not null default 'Asia/Riyadh',
  notify_hour int  not null default 9 check (notify_hour between 0 and 23),
  created_at  timestamptz not null default now()
);

create table if not exists public.items (
  space_id uuid   not null references public.spaces(id) on delete cascade,
  id       uuid   not null,
  data     jsonb  not null,
  updated  bigint not null,             -- وقت التعديل عند العميل (ms) — آخر تعديل يفوز
  deleted  boolean not null default false,
  rev      bigint not null default nextval('public.item_rev'),
  primary key (space_id, id)
);
create index if not exists items_space_rev on public.items (space_id, rev);

create table if not exists public.push_subs (
  endpoint   text primary key,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  sub        jsonb not null,
  device     text,
  last_sent  date,
  created_at timestamptz not null default now()
);

create table if not exists public.pair_codes (
  code       text primary key,
  space_key  text not null,
  expires_at timestamptz not null
);

create table if not exists public.pair_failures (
  at timestamptz not null default now()
);

alter table public.spaces        enable row level security;
alter table public.items         enable row level security;
alter table public.push_subs     enable row level security;
alter table public.pair_codes    enable row level security;
alter table public.pair_failures enable row level security;
revoke all on public.spaces, public.items, public.push_subs, public.pair_codes, public.pair_failures from anon, authenticated;

-- ===== أدوات داخلية =====
create or replace function public._space_id(p_key text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  if p_key is null or length(p_key) < 16 then raise exception 'bad key'; end if;
  select id into v from spaces where key_hash = encode(digest(p_key, 'sha256'), 'hex');
  if v is null then
    insert into spaces (key_hash) values (encode(digest(p_key, 'sha256'), 'hex'))
    on conflict (key_hash) do update set key_hash = excluded.key_hash
    returning id into v;
  end if;
  return v;
end $$;
revoke all on function public._space_id(text) from public, anon, authenticated;

-- ===== المساحة والإعدادات =====
create or replace function public.space_open(p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s spaces;
begin
  select * into s from spaces where id = _space_id(p_key);
  return json_build_object('read_token', s.read_token, 'tz', s.tz, 'notify_hour', s.notify_hour);
end $$;

create or replace function public.space_settings(p_key text, p_tz text, p_hour int)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update spaces set tz = coalesce(nullif(p_tz, ''), tz), notify_hour = coalesce(p_hour, notify_hour)
  where id = _space_id(p_key);
end $$;

-- ===== المزامنة =====
create or replace function public.items_push(p_key text, p_items jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid := _space_id(p_key); n int := 0; e jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be array'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'too many items'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    insert into items as t (space_id, id, data, updated, deleted)
    values (sid, (e->>'id')::uuid, e->'data', (e->>'updated')::bigint, coalesce((e->>'deleted')::boolean, false))
    on conflict (space_id, id) do update
      set data = excluded.data, updated = excluded.updated, deleted = excluded.deleted,
          rev = nextval('public.item_rev')
      where t.updated < excluded.updated;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.items_pull(p_key text, p_since bigint)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid := _space_id(p_key);
begin
  return json_build_object(
    'rev',   (select coalesce(max(rev), 0) from items where space_id = sid),
    'items', coalesce((select json_agg(json_build_object('id', id, 'data', data, 'updated', updated, 'deleted', deleted) order by rev)
                       from items where space_id = sid and rev > coalesce(p_since, 0)), '[]'::json)
  );
end $$;

-- ===== ربط الأجهزة =====
create or replace function public.pair_create(p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int; b bytea;
begin
  perform _space_id(p_key);
  delete from pair_codes where expires_at < now() or space_key = p_key;
  loop
    c := ''; b := gen_random_bytes(8);
    for i in 0..7 loop c := c || substr(alphabet, 1 + (get_byte(b, i) % 31), 1); end loop;
    exit when not exists (select 1 from pair_codes where code = c);
  end loop;
  insert into pair_codes values (c, p_key, now() + interval '15 minutes');
  return json_build_object('code', c, 'expires_at', now() + interval '15 minutes');
end $$;

create or replace function public.pair_claim(p_code text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text; norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  delete from pair_failures where at < now() - interval '15 minutes';
  if (select count(*) from pair_failures) > 60 then raise exception 'try later'; end if;
  delete from pair_codes where code = norm and expires_at > now() returning space_key into k;
  if k is null then
    insert into pair_failures default values;
    return null;
  end if;
  return k;
end $$;

-- ===== التنبيهات =====
create or replace function public.push_subscribe(p_key text, p_sub jsonb, p_device text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_sub->>'endpoint' is null or p_sub->>'endpoint' not like 'https://%' then raise exception 'bad subscription'; end if;
  insert into push_subs (endpoint, space_id, sub, device)
  values (p_sub->>'endpoint', _space_id(p_key), p_sub, left(p_device, 80))
  on conflict (endpoint) do update set space_id = excluded.space_id, sub = excluded.sub, device = excluded.device;
end $$;

create or replace function public.push_unsubscribe(p_key text, p_endpoint text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from push_subs where endpoint = p_endpoint and space_id = _space_id(p_key);
end $$;

-- ===== قراءة فقط (ودجت الآيفون / التقويم) =====
create or replace function public.widget_items(p_token text)
returns json language sql security definer set search_path = public, extensions stable as $$
  select coalesce(json_agg(x order by x->>'next'), '[]'::json) from (
    select jsonb_build_object('id', i.id, 'name', i.data->>'name', 'emoji', i.data->>'emoji',
                              'room', i.data->>'room', 'last', i.data->>'last', 'next', i.data->>'next',
                              'remind', coalesce(i.data->'remind', '[7,0]'::jsonb), 'notes', i.data->>'notes') as x
    from items i join spaces s on s.id = i.space_id
    where s.read_token = p_token and not i.deleted and coalesce((i.data->>'archived')::boolean, false) = false
      and i.data->>'next' is not null
  ) q;
$$;

grant execute on function public.space_open(text), public.space_settings(text, text, int),
  public.items_push(text, jsonb), public.items_pull(text, bigint),
  public.pair_create(text), public.pair_claim(text),
  public.push_subscribe(text, jsonb, text), public.push_unsubscribe(text, text),
  public.widget_items(text) to anon, authenticated;

-- ===== للخادم فقط (دالة التنبيهات) =====
-- تعيد الاشتراكات التي حان وقت تنبيهها اليوم (حسب ساعة ومنطقة المساحة) مع العناصر المستحقة،
-- وتعلّمها كمُرسلة اليوم حتى لا تتكرر.
create or replace function public.notify_take()
returns json language plpgsql security definer set search_path = public, extensions as $$
declare result json;
begin
  with eligible as (
    select p.endpoint, p.sub, p.space_id, (now() at time zone s.tz)::date as today
    from push_subs p join spaces s on s.id = p.space_id
    where extract(hour from (now() at time zone s.tz)) >= s.notify_hour
      and (p.last_sent is null or p.last_sent < (now() at time zone s.tz)::date)
  ), marked as (
    update push_subs p set last_sent = e.today from eligible e where p.endpoint = e.endpoint returning p.endpoint
  ), due as (
    select e.endpoint, json_agg(json_build_object(
             'name', i.data->>'name', 'emoji', i.data->>'emoji', 'next', i.data->>'next',
             'days', (i.data->>'next')::date - e.today) order by i.data->>'next') as items
    from eligible e join items i on i.space_id = e.space_id
    where not i.deleted and coalesce((i.data->>'archived')::boolean, false) = false
      and i.data->>'next' ~ '^\d{4}-\d{2}-\d{2}$'
      and (
        ((i.data->>'next')::date - e.today) in (select (jsonb_array_elements_text(coalesce(i.data->'remind', '[7,0]'::jsonb)))::int)
        or (((i.data->>'next')::date - e.today) < 0 and (e.today - (i.data->>'next')::date) % 7 = 1)
      )
    group by e.endpoint
  )
  select coalesce(json_agg(json_build_object('endpoint', e.endpoint, 'sub', e.sub, 'items', d.items)), '[]'::json)
    into result
  from eligible e join due d on d.endpoint = e.endpoint
  where (select count(*) from marked) >= 0;
  return result;
end $$;

create or replace function public.push_drop(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from push_subs where endpoint = any(p_endpoints);
$$;

revoke all on function public.notify_take(), public.push_drop(text[]) from public, anon, authenticated;
grant execute on function public.notify_take(), public.push_drop(text[]) to service_role;
