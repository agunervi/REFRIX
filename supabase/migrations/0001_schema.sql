-- =====================================================================
-- Inventario doméstico: esquema completo para Supabase (PostgreSQL 15+)
--
-- Contenido:
--   1. Esquema privado y funciones auxiliares de permisos
--   2. Tablas (usuarios, inventarios, membresías, invitaciones,
--      ubicaciones, categorías, subcategorías, unidades, productos,
--      movimientos, lista de compras, alertas, notificaciones)
--   3. Triggers (historial, lista de compras, alertas, versión de estructura)
--   4. Row Level Security
--   5. RPCs para el cliente y para el proceso programado
--   6. Permisos (GRANT / REVOKE) y publicación Realtime
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Esquema privado y helpers de permisos
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "Hoy" para vencimientos. Zona horaria fija de la app (Chile).
create or replace function private.app_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- 2.1 users: perfil público de cada cuenta de auth.users
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_uq on public.users (lower(email));

create trigger users_updated_at before update on public.users
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- 2.2 inventories
create table public.inventories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  icon text not null default 'home',
  color text not null default '#10b981' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Se incrementa cuando cambia la estructura (ubicaciones, categorías, compras,
  -- colaboradores). Los clientes lo usan como señal fiable en Realtime.
  structure_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_inventory_change_at timestamptz not null default now()
);
create index inventories_owner_idx on public.inventories (owner_id);

create trigger inventories_updated_at before update on public.inventories
  for each row execute function private.set_updated_at();

-- 2.3 inventory_members
create table public.inventory_members (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_id, user_id)
);
create index inventory_members_user_idx on public.inventory_members (user_id);

create trigger inventory_members_updated_at before update on public.inventory_members
  for each row execute function private.set_updated_at();

-- 2.4 inventory_invitations
create table public.inventory_invitations (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  invited_email text,                       -- null = invitación por enlace
  token_hash text not null unique,          -- sha256 del token; el token nunca se guarda
  role text not null check (role in ('viewer', 'editor', 'admin')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users (id) on delete set null,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_invitations_inventory_idx on public.inventory_invitations (inventory_id);
create index inventory_invitations_email_idx on public.inventory_invitations (lower(invited_email));

-- 2.5 locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'package',
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, inventory_id)
);
create unique index locations_name_uq on public.locations (inventory_id, lower(name));

create trigger locations_updated_at before update on public.locations
  for each row execute function private.set_updated_at();

-- 2.6 categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default 'tag',
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, inventory_id)
);
create unique index categories_name_uq on public.categories (inventory_id, lower(name));

create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

-- 2.7 subcategories
create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, inventory_id),
  foreign key (category_id, inventory_id)
    references public.categories (id, inventory_id) on delete cascade
);
create unique index subcategories_name_uq on public.subcategories (category_id, lower(name));

create trigger subcategories_updated_at before update on public.subcategories
  for each row execute function private.set_updated_at();

-- 2.8 custom_units
create table public.custom_units (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index custom_units_name_uq on public.custom_units (inventory_id, lower(name));

-- 2.9 products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  location_id uuid,
  category_id uuid,
  subcategory_id uuid,
  quantity numeric(12, 3) not null default 0 check (quantity >= 0),
  unit text not null default 'unidades' check (char_length(unit) between 1 and 30),
  min_stock numeric(12, 3) not null default 1 check (min_stock >= 0),
  brand text check (brand is null or char_length(brand) <= 80),
  expiry_date date,
  notes text check (notes is null or char_length(notes) <= 1000),
  image_path text,
  is_example boolean not null default false,
  expiry_alert_state text check (expiry_alert_state in ('soon', 'expired')),
  stock_status text generated always as (
    case
      when quantity <= 0 then 'out'
      when quantity <= min_stock then 'low'
      else 'ok'
    end
  ) stored,
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Las referencias llevan inventory_id: un producto jamás puede apuntar a una
  -- ubicación o categoría de OTRO inventario.
  foreign key (location_id, inventory_id)
    references public.locations (id, inventory_id) on delete set null (location_id),
  foreign key (category_id, inventory_id)
    references public.categories (id, inventory_id) on delete set null (category_id),
  foreign key (subcategory_id, inventory_id)
    references public.subcategories (id, inventory_id) on delete set null (subcategory_id)
);
create index products_inventory_idx on public.products (inventory_id);
create index products_location_idx on public.products (location_id);
create index products_category_idx on public.products (category_id);
create index products_expiry_idx on public.products (expiry_date) where expiry_date is not null;

create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- La subcategoría debe pertenecer a la categoría del producto.
-- Si cambia la fecha de vencimiento se reinicia el estado de aviso.
create or replace function private.products_before_write()
returns trigger
language plpgsql
as $$
begin
  -- Autoría controlada por el servidor, no por el cliente
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;

  if new.subcategory_id is not null then
    if new.category_id is null then
      -- Sin categoría no puede haber subcategoría (ocurre al eliminar una categoría)
      new.subcategory_id := null;
    elsif not exists (
      select 1 from public.subcategories s
      where s.id = new.subcategory_id and s.category_id = new.category_id
    ) then
      raise exception 'La subcategoría no pertenece a la categoría del producto'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.expiry_date is distinct from old.expiry_date then
    new.expiry_alert_state := null;
  end if;
  return new;
end;
$$;

create trigger products_before_write before insert or update on public.products
  for each row execute function private.products_before_write();

-- 2.10 inventory_movements (historial, solo lectura para el cliente)
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  product_id uuid,                          -- sin FK: el historial sobrevive al producto
  product_name text not null,
  unit text,
  action text not null check (action in
    ('create', 'increase', 'decrease', 'set', 'update', 'delete', 'purchase', 'clear')),
  quantity_before numeric(12, 3),
  quantity_after numeric(12, 3),
  diff numeric(12, 3) generated always as (coalesce(quantity_after, 0) - coalesce(quantity_before, 0)) stored,
  user_id uuid references public.users (id) on delete set null,
  user_name text not null,
  created_at timestamptz not null default now()
);
create index movements_inventory_created_idx on public.inventory_movements (inventory_id, created_at desc);
create index movements_product_idx on public.inventory_movements (inventory_id, product_id);

-- 2.11 shopping_list
create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity_needed numeric(12, 3) check (quantity_needed is null or quantity_needed > 0),
  unit text,
  note text check (note is null or char_length(note) <= 300),
  auto boolean not null default false,
  reason text not null default 'manual' check (reason in ('manual', 'low', 'out')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  is_bought boolean not null default false,
  bought_at timestamptz,
  bought_by uuid references public.users (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_inventory_idx on public.shopping_list (inventory_id);
-- Un producto solo puede tener UN ítem abierto en la lista.
create unique index shopping_open_product_uq on public.shopping_list (product_id)
  where not is_bought and product_id is not null;

create trigger shopping_list_updated_at before update on public.shopping_list
  for each row execute function private.set_updated_at();

-- 2.12 notification_preferences (individuales por usuario e inventario)
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  notifications_enabled boolean not null default true,
  low_stock boolean not null default true,
  out_of_stock boolean not null default true,
  expiry boolean not null default true,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  delay_minutes integer not null default 30 check (delay_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, inventory_id)
);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- 2.13 stock_alerts: alertas diferidas (las procesa el backend, no el navegador)
create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  kind text not null check (kind in ('stock', 'expiry')),
  level text not null check (level in ('low', 'out', 'soon', 'expired')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'skipped')),
  quantity numeric(12, 3),
  scheduled_at timestamptz not null,        -- primer momento posible de envío
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  cancelled_at timestamptz
);
create index stock_alerts_inventory_idx on public.stock_alerts (inventory_id);
create index stock_alerts_pending_idx on public.stock_alerts (status) where status = 'pending';
-- Una sola alerta pendiente por producto y tipo: evita correos duplicados.
create unique index stock_alerts_pending_uq on public.stock_alerts (product_id, kind)
  where status = 'pending';

-- 2.14 alert_deliveries: control de envíos por destinatario (idempotencia)
create table public.alert_deliveries (
  alert_id uuid not null references public.stock_alerts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  primary key (alert_id, user_id)
);

-- 2.15 notifications (bandeja interna)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  type text not null check (type in ('low_stock', 'out_of_stock', 'expiring', 'expired', 'info')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_product_idx on public.notifications (product_id);

-- ---------------------------------------------------------------------
-- 3. Funciones de permisos (conjuntos cacheables por las políticas RLS)
-- ---------------------------------------------------------------------
create or replace function private.my_inventory_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.inventories where owner_id = auth.uid()
  union
  select inventory_id from public.inventory_members where user_id = auth.uid();
$$;

create or replace function private.my_writable_inventory_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.inventories where owner_id = auth.uid()
  union
  select inventory_id from public.inventory_members
  where user_id = auth.uid() and role in ('admin', 'editor');
$$;

create or replace function private.my_admin_inventory_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.inventories where owner_id = auth.uid()
  union
  select inventory_id from public.inventory_members
  where user_id = auth.uid() and role = 'admin';
$$;

-- 'owner' | 'admin' | 'editor' | 'viewer' | null
create or replace function private.inventory_role(p_inventory uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when i.owner_id = auth.uid() then 'owner'
    else (
      select m.role from public.inventory_members m
      where m.inventory_id = i.id and m.user_id = auth.uid()
    )
  end
  from public.inventories i
  where i.id = p_inventory;
$$;

create or replace function private.shares_inventory_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inventories i
    where i.id in (select private.my_inventory_ids())
      and (
        i.owner_id = p_user
        or exists (
          select 1 from public.inventory_members m
          where m.inventory_id = i.id and m.user_id = p_user
        )
      )
  );
$$;

-- Destinatarios de una alerta según sus preferencias individuales.
-- p_level: 'low' | 'out' | 'soon' | 'expired'. Sin fila de preferencias = valores por defecto.
create or replace function private.notification_recipients(p_inventory uuid, p_level text)
returns table (user_id uuid, delay_minutes integer, email_enabled boolean, in_app_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    coalesce(np.delay_minutes, 30),
    coalesce(np.email_enabled, true),
    coalesce(np.in_app_enabled, true)
  from (
    select i.owner_id as id from public.inventories i where i.id = p_inventory
    union
    select m.user_id from public.inventory_members m where m.inventory_id = p_inventory
  ) members
  join public.users u on u.id = members.id
  left join public.notification_preferences np
    on np.user_id = u.id and np.inventory_id = p_inventory
  where coalesce(np.notifications_enabled, true)
    and case p_level
          when 'low' then coalesce(np.low_stock, true)
          when 'out' then coalesce(np.out_of_stock, true)
          else coalesce(np.expiry, true)
        end;
$$;

-- ---------------------------------------------------------------------
-- 4. Triggers de negocio
-- ---------------------------------------------------------------------

-- 4.1 Versión de estructura: señal para Realtime (los DELETE no son filtrables)
create or replace function private.bump_inventory_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory uuid;
begin
  if tg_op = 'DELETE' then
    v_inventory := old.inventory_id;
  else
    v_inventory := new.inventory_id;
  end if;
  update public.inventories
     set structure_version = structure_version + 1
   where id = v_inventory;
  return null;
end;
$$;

create trigger locations_bump after insert or update or delete on public.locations
  for each row execute function private.bump_inventory_version();
create trigger categories_bump after insert or update or delete on public.categories
  for each row execute function private.bump_inventory_version();
create trigger subcategories_bump after insert or update or delete on public.subcategories
  for each row execute function private.bump_inventory_version();
create trigger custom_units_bump after insert or update or delete on public.custom_units
  for each row execute function private.bump_inventory_version();
create trigger shopping_list_bump after insert or update or delete on public.shopping_list
  for each row execute function private.bump_inventory_version();
create trigger inventory_members_bump after insert or update or delete on public.inventory_members
  for each row execute function private.bump_inventory_version();

-- 4.2 Historial de movimientos de productos
create or replace function private.log_product_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_user_name text;
  v_action text;
begin
  select u.display_name into v_user_name from public.users u where u.id = v_user;
  v_user_name := coalesce(v_user_name, 'Sistema');

  if tg_op = 'INSERT' then
    insert into public.inventory_movements
      (inventory_id, product_id, product_name, unit, action, quantity_before, quantity_after, user_id, user_name)
    values
      (new.inventory_id, new.id, new.name, new.unit, 'create', null, new.quantity, v_user, v_user_name);
    return new;

  elsif tg_op = 'DELETE' then
    -- Si el inventario completo se está eliminando en cascada, no hay nada que registrar.
    if not exists (select 1 from public.inventories i where i.id = old.inventory_id) then
      return old;
    end if;
    insert into public.inventory_movements
      (inventory_id, product_id, product_name, unit, action, quantity_before, quantity_after, user_id, user_name)
    values
      (old.inventory_id, old.id, old.name, old.unit, 'delete', old.quantity, null, v_user, v_user_name);
    return old;

  else -- UPDATE
    if new.quantity is distinct from old.quantity then
      v_action := nullif(current_setting('app.movement_action', true), '');
      if v_action is null or v_action not in ('set', 'purchase', 'clear', 'increase', 'decrease') then
        v_action := case when new.quantity > old.quantity then 'increase' else 'decrease' end;
      end if;
      insert into public.inventory_movements
        (inventory_id, product_id, product_name, unit, action, quantity_before, quantity_after, user_id, user_name)
      values
        (new.inventory_id, new.id, new.name, new.unit, v_action, old.quantity, new.quantity, v_user, v_user_name);
    elsif new.name is distinct from old.name
       or new.unit is distinct from old.unit
       or new.min_stock is distinct from old.min_stock
       or new.location_id is distinct from old.location_id
       or new.category_id is distinct from old.category_id
       or new.subcategory_id is distinct from old.subcategory_id
       or new.expiry_date is distinct from old.expiry_date
       or new.brand is distinct from old.brand
       or new.notes is distinct from old.notes
       or new.image_path is distinct from old.image_path then
      insert into public.inventory_movements
        (inventory_id, product_id, product_name, unit, action, quantity_before, quantity_after, user_id, user_name)
      values
        (new.inventory_id, new.id, new.name, new.unit, 'update', new.quantity, new.quantity, v_user, v_user_name);
    end if;
    return new;
  end if;
end;
$$;

create trigger products_log after insert or update or delete on public.products
  for each row execute function private.log_product_change();

-- Cada movimiento actualiza "última modificación" del inventario (hora de la BASE DE DATOS).
create or replace function private.touch_inventory_on_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventories
     set last_inventory_change_at = new.created_at
   where id = new.inventory_id;
  return null;
end;
$$;

create trigger movements_touch_inventory after insert on public.inventory_movements
  for each row execute function private.touch_inventory_on_movement();

-- 4.3 Transiciones de stock: lista de compras, alertas diferidas y notificaciones internas
create or replace function private.handle_stock_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text;
  v_rank_old integer;
  v_rank_new integer;
  v_min_delay integer;
  v_existing uuid;
begin
  if not exists (select 1 from public.inventories i where i.id = new.inventory_id) then
    return new;
  end if;

  v_old := case when tg_op = 'INSERT' then 'ok' else old.stock_status end;
  v_new := new.stock_status;

  -- Cambió la fecha de vencimiento: las alertas de vencimiento anteriores ya no aplican.
  if tg_op = 'UPDATE' and new.expiry_date is distinct from old.expiry_date then
    update public.stock_alerts
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where product_id = new.id and kind = 'expiry' and status = 'pending';
    delete from public.notifications
     where product_id = new.id and type in ('expiring', 'expired') and read_at is null;
  end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    if new.name is distinct from old.name or new.unit is distinct from old.unit then
      update public.shopping_list
         set name = new.name, unit = new.unit
       where product_id = new.id and not is_bought;
    end if;
    return new;
  end if;

  if v_new = 'ok' then
    -- Recuperó stock: sale de la lista de compras y se cancelan alertas pendientes.
    delete from public.shopping_list
     where product_id = new.id and not is_bought and auto;
    update public.stock_alerts
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where product_id = new.id and kind = 'stock' and status = 'pending';
    delete from public.notifications
     where product_id = new.id and type in ('low_stock', 'out_of_stock') and read_at is null;
    return new;
  end if;

  -- Stock bajo o agotado: entra (o se actualiza) en la lista de compras.
  insert into public.shopping_list
    (inventory_id, product_id, name, unit, auto, reason, priority, created_by)
  values
    (new.inventory_id, new.id, new.name, new.unit, true, v_new,
     case when v_new = 'out' then 'high' else 'normal' end, auth.uid())
  on conflict (product_id) where (not is_bought and product_id is not null)
  do update set
    reason = excluded.reason,
    priority = case
      when excluded.reason = 'out' and public.shopping_list.priority = 'normal' then 'high'
      else public.shopping_list.priority
    end;

  v_rank_old := case v_old when 'ok' then 0 when 'low' then 1 else 2 end;
  v_rank_new := case v_new when 'ok' then 0 when 'low' then 1 else 2 end;

  if v_rank_new > v_rank_old then
    select min(r.delay_minutes) into v_min_delay
      from private.notification_recipients(new.inventory_id, v_new) r
     where r.email_enabled;

    select a.id into v_existing
      from public.stock_alerts a
     where a.product_id = new.id and a.kind = 'stock' and a.status = 'pending';

    if v_existing is null then
      insert into public.stock_alerts
        (inventory_id, product_id, kind, level, quantity, scheduled_at)
      values
        (new.inventory_id, new.id, 'stock', v_new, new.quantity,
         now() + make_interval(mins => coalesce(v_min_delay, 30)));
    else
      -- Ya había una alerta pendiente: se actualiza, NO se crea otra.
      update public.stock_alerts
         set level = v_new, quantity = new.quantity, updated_at = now()
       where id = v_existing;
    end if;

    -- Notificación interna inmediata (una sola sin leer por producto).
    delete from public.notifications
     where product_id = new.id and type in ('low_stock', 'out_of_stock') and read_at is null;
    insert into public.notifications (inventory_id, user_id, product_id, type, message)
    select
      new.inventory_id,
      r.user_id,
      new.id,
      case v_new when 'out' then 'out_of_stock' else 'low_stock' end,
      case v_new
        when 'out' then 'Se agotó ' || new.name || '.'
        else new.name || ' está bajo el stock mínimo.'
      end
    from private.notification_recipients(new.inventory_id, v_new) r
    where r.in_app_enabled;
  else
    -- Mejoró pero sigue bajo (agotado a bajo): se ajusta la alerta pendiente si existe.
    update public.stock_alerts
       set level = v_new, quantity = new.quantity, updated_at = now()
     where product_id = new.id and kind = 'stock' and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger products_stock_transition after insert or update on public.products
  for each row execute function private.handle_stock_transition();

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.inventories enable row level security;
alter table public.inventory_members enable row level security;
alter table public.inventory_invitations enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.custom_units enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.shopping_list enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.notifications enable row level security;

-- users: yo y las personas con las que comparto algún inventario
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or private.shares_inventory_with(id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- inventories
-- (la primera condición evita que el INSERT ... RETURNING falle: la función
--  no vería todavía la fila recién insertada)
create policy inventories_select on public.inventories for select to authenticated
  using (owner_id = auth.uid() or id in (select private.my_inventory_ids()));
create policy inventories_insert on public.inventories for insert to authenticated
  with check (owner_id = auth.uid());
create policy inventories_update on public.inventories for update to authenticated
  using (id in (select private.my_admin_inventory_ids()))
  with check (id in (select private.my_admin_inventory_ids()));
create policy inventories_delete on public.inventories for delete to authenticated
  using (owner_id = auth.uid());

-- inventory_members
create policy members_select on public.inventory_members for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy members_update on public.inventory_members for update to authenticated
  using (
    private.inventory_role(inventory_id) = 'owner'
    or (private.inventory_role(inventory_id) = 'admin' and role in ('viewer', 'editor'))
  )
  with check (
    private.inventory_role(inventory_id) = 'owner'
    or (private.inventory_role(inventory_id) = 'admin' and role in ('viewer', 'editor'))
  );
create policy members_delete on public.inventory_members for delete to authenticated
  using (
    user_id = auth.uid()
    or private.inventory_role(inventory_id) = 'owner'
    or (private.inventory_role(inventory_id) = 'admin' and role in ('viewer', 'editor'))
  );

-- inventory_invitations: solo administradores/propietario las ven; se crean por RPC
create policy invitations_select on public.inventory_invitations for select to authenticated
  using (inventory_id in (select private.my_admin_inventory_ids()));

-- Tablas de datos del inventario: leer = miembro, escribir = editor, admin o propietario
create policy locations_select on public.locations for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy locations_insert on public.locations for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy locations_update on public.locations for update to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()))
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy locations_delete on public.locations for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy categories_select on public.categories for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy categories_insert on public.categories for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy categories_update on public.categories for update to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()))
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy categories_delete on public.categories for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy subcategories_select on public.subcategories for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy subcategories_insert on public.subcategories for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy subcategories_update on public.subcategories for update to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()))
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy subcategories_delete on public.subcategories for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy custom_units_select on public.custom_units for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy custom_units_insert on public.custom_units for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy custom_units_delete on public.custom_units for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy products_select on public.products for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy products_insert on public.products for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy products_update on public.products for update to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()))
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy products_delete on public.products for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy movements_select on public.inventory_movements for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));

create policy shopping_select on public.shopping_list for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));
create policy shopping_insert on public.shopping_list for insert to authenticated
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy shopping_update on public.shopping_list for update to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()))
  with check (inventory_id in (select private.my_writable_inventory_ids()));
create policy shopping_delete on public.shopping_list for delete to authenticated
  using (inventory_id in (select private.my_writable_inventory_ids()));

create policy alerts_select on public.stock_alerts for select to authenticated
  using (inventory_id in (select private.my_inventory_ids()));

-- alert_deliveries: sin políticas = solo service_role

-- notificaciones internas: personales
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and inventory_id in (select private.my_inventory_ids()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- preferencias: personales
create policy prefs_select on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());
create policy prefs_insert on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid() and inventory_id in (select private.my_inventory_ids()));
create policy prefs_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and inventory_id in (select private.my_inventory_ids()));
create policy prefs_delete on public.notification_preferences for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. Vista resumen para el dashboard (respeta RLS del usuario que consulta)
-- ---------------------------------------------------------------------
create or replace view public.inventory_overview
with (security_invoker = true) as
select
  i.id,
  i.owner_id,
  i.name,
  i.description,
  i.icon,
  i.color,
  i.structure_version,
  i.created_at,
  i.updated_at,
  i.last_inventory_change_at,
  u.display_name as owner_name,
  private.inventory_role(i.id) as my_role,
  coalesce(c.total, 0)::int as product_count,
  coalesce(c.low, 0)::int as low_count,
  coalesce(c.out_of_stock, 0)::int as out_count,
  coalesce(c.expiring, 0)::int as expiring_count,
  coalesce(c.expired, 0)::int as expired_count
from public.inventories i
left join public.users u on u.id = i.owner_id
left join lateral (
  select
    count(*) as total,
    count(*) filter (where p.stock_status = 'low') as low,
    count(*) filter (where p.stock_status = 'out') as out_of_stock,
    count(*) filter (
      where p.expiry_date is not null
        and p.expiry_date >= private.app_today()
        and p.expiry_date <= private.app_today() + 7
    ) as expiring,
    count(*) filter (where p.expiry_date is not null and p.expiry_date < private.app_today()) as expired
  from public.products p
  where p.inventory_id = i.id
) c on true;

-- ---------------------------------------------------------------------
-- 7. RPCs para el cliente
-- ---------------------------------------------------------------------

-- Hora del servidor (para calcular el desfase del reloj local)
create or replace function public.server_now()
returns timestamptz
language sql
volatile
as $$
  select clock_timestamp();
$$;

-- Ajuste atómico de stock (+/-): evita pisar cambios simultáneos de otro usuario.
create or replace function public.adjust_product_quantity(
  p_product uuid,
  p_delta numeric,
  p_action text default null
)
returns public.products
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.products;
begin
  perform set_config('app.movement_action', coalesce(p_action, ''), true);
  update public.products
     set quantity = greatest(0, quantity + p_delta),
         updated_by = auth.uid()
   where id = p_product
  returning * into v_row;

  -- FOUND se evalúa justo después del UPDATE (un PERFORM posterior lo sobrescribe)
  if not found then
    raise exception 'Producto no encontrado o sin permiso para modificarlo'
      using errcode = '42501';
  end if;
  perform set_config('app.movement_action', '', true);
  return v_row;
end;
$$;

create or replace function public.set_product_quantity(
  p_product uuid,
  p_quantity numeric,
  p_action text default 'set'
)
returns public.products
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.products;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad debe ser un número mayor o igual a cero' using errcode = '22023';
  end if;
  perform set_config('app.movement_action', coalesce(p_action, ''), true);
  update public.products
     set quantity = p_quantity,
         updated_by = auth.uid()
   where id = p_product
  returning * into v_row;

  -- FOUND se evalúa justo después del UPDATE (un PERFORM posterior lo sobrescribe)
  if not found then
    raise exception 'Producto no encontrado o sin permiso para modificarlo'
      using errcode = '42501';
  end if;
  perform set_config('app.movement_action', '', true);
  return v_row;
end;
$$;

-- Eliminar ubicación con destino para sus productos: 'move' | 'orphan' | 'delete'
create or replace function public.delete_location(
  p_location uuid,
  p_mode text,
  p_target uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inventory uuid;
  v_deleted integer;
begin
  select l.inventory_id into v_inventory from public.locations l where l.id = p_location;
  if v_inventory is null then
    raise exception 'Ubicación no encontrada' using errcode = 'P0002';
  end if;
  if p_mode not in ('move', 'orphan', 'delete') then
    raise exception 'Modo inválido' using errcode = '22023';
  end if;

  if p_mode = 'move' then
    if p_target is null or p_target = p_location
       or not exists (select 1 from public.locations l where l.id = p_target and l.inventory_id = v_inventory) then
      raise exception 'Destino inválido' using errcode = '22023';
    end if;
    update public.products set location_id = p_target where location_id = p_location;
  elsif p_mode = 'delete' then
    delete from public.products where location_id = p_location;
  end if;

  delete from public.locations where id = p_location;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'No tienes permiso para eliminar esta ubicación' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_category(
  p_category uuid,
  p_mode text,
  p_target uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inventory uuid;
  v_deleted integer;
begin
  select c.inventory_id into v_inventory from public.categories c where c.id = p_category;
  if v_inventory is null then
    raise exception 'Categoría no encontrada' using errcode = 'P0002';
  end if;
  if p_mode not in ('move', 'orphan', 'delete') then
    raise exception 'Modo inválido' using errcode = '22023';
  end if;

  if p_mode = 'move' then
    if p_target is null or p_target = p_category
       or not exists (select 1 from public.categories c where c.id = p_target and c.inventory_id = v_inventory) then
      raise exception 'Destino inválido' using errcode = '22023';
    end if;
    update public.products
       set category_id = p_target, subcategory_id = null
     where category_id = p_category;
  elsif p_mode = 'delete' then
    delete from public.products where category_id = p_category;
  end if;

  delete from public.categories where id = p_category;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'No tienes permiso para eliminar esta categoría' using errcode = '42501';
  end if;
end;
$$;

-- Marcar un ítem de compras como comprado, opcionalmente sumando stock al producto
create or replace function public.mark_shopping_item_bought(
  p_item uuid,
  p_add numeric default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.shopping_list;
begin
  update public.shopping_list
     set is_bought = true, bought_at = now(), bought_by = auth.uid()
   where id = p_item and not is_bought
  returning * into v_item;

  if not found then
    raise exception 'Ítem no encontrado, ya comprado o sin permiso' using errcode = '42501';
  end if;

  if v_item.product_id is not null and p_add is not null and p_add > 0 then
    perform set_config('app.movement_action', 'purchase', true);
    update public.products
       set quantity = quantity + p_add, updated_by = auth.uid()
     where id = v_item.product_id;
    perform set_config('app.movement_action', '', true);
  end if;
end;
$$;

-- Estructura de ejemplo (todo marcado is_example para poder borrarlo por completo)
create or replace function public.seed_example_data(p_inventory uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text := private.inventory_role(p_inventory);
  v_desp uuid; v_refri uuid; v_bano uuid;
  v_alim uuid; v_beb uuid; v_limp uuid; v_aseo uuid;
  v_desayuno uuid;
begin
  if v_role is null or v_role not in ('owner', 'admin', 'editor') then
    raise exception 'No tienes permiso para modificar este inventario' using errcode = '42501';
  end if;

  insert into public.locations (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Despensa', 'archive', '#f59e0b', 1, true) returning id into v_desp;
  insert into public.locations (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Refrigerador', 'refrigerator', '#0ea5e9', 2, true) returning id into v_refri;
  insert into public.locations (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Baño', 'bath', '#8b5cf6', 3, true) returning id into v_bano;

  insert into public.categories (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Alimentos', 'apple', '#22c55e', 1, true) returning id into v_alim;
  insert into public.categories (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Bebidas', 'cup-soda', '#06b6d4', 2, true) returning id into v_beb;
  insert into public.categories (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Limpieza', 'spray-can', '#3b82f6', 3, true) returning id into v_limp;
  insert into public.categories (inventory_id, name, icon, color, sort_order, is_example)
  values (p_inventory, 'Aseo personal', 'sparkles', '#ec4899', 4, true) returning id into v_aseo;

  insert into public.subcategories (inventory_id, category_id, name, sort_order, is_example)
  values (p_inventory, v_alim, 'Desayuno', 1, true) returning id into v_desayuno;

  insert into public.products
    (inventory_id, name, location_id, category_id, subcategory_id, quantity, unit, min_stock, is_example, created_by)
  values
    (p_inventory, 'Leche', v_refri, v_alim, v_desayuno, 4, 'litros', 2, true, auth.uid()),
    (p_inventory, 'Arroz', v_desp, v_alim, null, 3, 'kg', 1, true, auth.uid()),
    (p_inventory, 'Agua mineral', v_desp, v_beb, null, 6, 'botellas', 3, true, auth.uid()),
    (p_inventory, 'Detergente', v_desp, v_limp, null, 2, 'botellas', 1, true, auth.uid()),
    (p_inventory, 'Papel higiénico', v_bano, v_aseo, null, 8, 'rollos', 4, true, auth.uid()),
    (p_inventory, 'Shampoo', v_bano, v_aseo, null, 2, 'frascos', 1, true, auth.uid());
end;
$$;

create or replace function public.remove_example_data(p_inventory uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text := private.inventory_role(p_inventory);
begin
  if v_role is null or v_role not in ('owner', 'admin', 'editor') then
    raise exception 'No tienes permiso para modificar este inventario' using errcode = '42501';
  end if;
  delete from public.products where inventory_id = p_inventory and is_example;
  delete from public.subcategories where inventory_id = p_inventory and is_example;
  delete from public.categories where inventory_id = p_inventory and is_example;
  delete from public.locations where inventory_id = p_inventory and is_example;
end;
$$;

create or replace function public.mark_all_notifications_read(p_inventory uuid default null)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_inventory is null or inventory_id = p_inventory);
$$;

-- ---------------------------------------------------------------------
-- 8. Invitaciones seguras
-- ---------------------------------------------------------------------

-- Crea una invitación. Devuelve el token en claro UNA sola vez (solo se guarda su hash).
create or replace function public.create_invitation(
  p_inventory uuid,
  p_role text,
  p_email text default null,
  p_days integer default 7
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  v_role := private.inventory_role(p_inventory);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'No tienes permiso para invitar personas a este inventario' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('viewer', 'editor', 'admin') then
    raise exception 'Rol inválido' using errcode = '22023';
  end if;
  if p_role = 'admin' and v_role <> 'owner' then
    raise exception 'Solo el propietario puede invitar administradores' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then
    raise exception 'La expiración debe estar entre 1 y 30 días' using errcode = '22023';
  end if;
  if v_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Correo inválido' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.users u
      where lower(u.email) = v_email
        and (u.id = (select i.owner_id from public.inventories i where i.id = p_inventory)
             or exists (select 1 from public.inventory_members m
                        where m.inventory_id = p_inventory and m.user_id = u.id))
    ) then
      raise exception 'Esa persona ya colabora en este inventario' using errcode = '23505';
    end if;
    -- Reemplaza invitaciones pendientes anteriores al mismo correo
    update public.inventory_invitations i
       set revoked_at = now()
     where i.inventory_id = p_inventory
       and lower(i.invited_email) = v_email
       and i.accepted_at is null and i.revoked_at is null and i.declined_at is null;
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => p_days);

  insert into public.inventory_invitations
    (inventory_id, invited_email, token_hash, role, expires_at, created_by)
  values
    (p_inventory, v_email, encode(sha256(convert_to(v_token, 'utf8')), 'hex'), p_role, v_expires, v_uid)
  returning inventory_invitations.id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

-- Vista previa de una invitación por token. Solo para usuarios autenticados.
create or replace function public.get_invitation_preview(p_token text)
returns table (
  invitation_id uuid,
  status text,
  inventory_id uuid,
  inventory_name text,
  inventory_description text,
  inventory_icon text,
  inventory_color text,
  owner_name text,
  role text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inv public.inventory_invitations;
  v_email text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select * into v_inv
    from public.inventory_invitations i
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if not found then
    return;
  end if;

  select u.email into v_email from public.users u where u.id = auth.uid();

  v_status := case
    when v_inv.accepted_at is not null and v_inv.accepted_by = auth.uid() then 'accepted_by_me'
    when v_inv.accepted_at is not null then 'accepted'
    when v_inv.revoked_at is not null then 'revoked'
    when v_inv.declined_at is not null then 'declined'
    when v_inv.expires_at <= now() then 'expired'
    when v_inv.invited_email is not null and lower(v_inv.invited_email) <> lower(v_email) then 'wrong_account'
    else 'pending'
  end;

  if v_status in ('pending', 'accepted_by_me') then
    return query
    select v_inv.id, v_status, i.id, i.name, i.description, i.icon, i.color,
           u.display_name, v_inv.role, v_inv.expires_at
      from public.inventories i
      join public.users u on u.id = i.owner_id
     where i.id = v_inv.inventory_id;
  else
    return query
    select v_inv.id, v_status, null::uuid, null::text, null::text, null::text, null::text,
           null::text, null::text, null::timestamptz;
  end if;
end;
$$;

create or replace function private.accept_invitation_row(p_invitation uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.inventory_invitations;
  v_email text;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select * into v_inv from public.inventory_invitations i where i.id = p_invitation for update;
  if not found then
    raise exception 'Invitación no válida' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = auth.uid() then
      return v_inv.inventory_id;
    end if;
    raise exception 'Esta invitación ya fue utilizada' using errcode = '23505';
  end if;
  if v_inv.revoked_at is not null or v_inv.declined_at is not null then
    raise exception 'Esta invitación ya no está disponible' using errcode = '42501';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Esta invitación expiró' using errcode = '42501';
  end if;

  select u.email into v_email from public.users u where u.id = auth.uid();
  if v_inv.invited_email is not null and lower(v_inv.invited_email) <> lower(v_email) then
    raise exception 'Esta invitación fue enviada a otra cuenta' using errcode = '42501';
  end if;

  select i.owner_id into v_owner from public.inventories i where i.id = v_inv.inventory_id;
  if v_owner is null then
    raise exception 'El inventario ya no existe' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() then
    insert into public.inventory_members (inventory_id, user_id, role)
    values (v_inv.inventory_id, auth.uid(), v_inv.role)
    on conflict (inventory_id, user_id) do nothing;   -- si ya era miembro se conserva su rol
  end if;

  update public.inventory_invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_inv.id;

  return v_inv.inventory_id;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select i.id into v_id
    from public.inventory_invitations i
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if v_id is null then
    raise exception 'Invitación no válida' using errcode = 'P0002';
  end if;
  return private.accept_invitation_row(v_id);
end;
$$;

create or replace function public.decline_invitation(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  select u.email into v_email from public.users u where u.id = auth.uid();
  update public.inventory_invitations i
     set declined_at = now()
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
     and (i.invited_email is null or lower(i.invited_email) = lower(v_email));
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Invitación no válida' using errcode = 'P0002';
  end if;
end;
$$;

-- Invitaciones por correo pendientes para mi cuenta (se aceptan sin abrir el enlace)
create or replace function public.list_my_invitations()
returns table (
  id uuid,
  inventory_id uuid,
  inventory_name text,
  inventory_icon text,
  inventory_color text,
  owner_name text,
  role text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, inv.id, inv.name, inv.icon, inv.color, o.display_name, i.role, i.expires_at, i.created_at
    from public.inventory_invitations i
    join public.inventories inv on inv.id = i.inventory_id
    join public.users o on o.id = inv.owner_id
    join public.users me on me.id = auth.uid()
   where i.invited_email is not null
     and lower(i.invited_email) = lower(me.email)
     and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
     and i.expires_at > now()
   order by i.created_at desc;
$$;

create or replace function public.accept_invitation_by_id(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select u.email into v_email from public.users u where u.id = auth.uid();
  if not exists (
    select 1 from public.inventory_invitations i
     where i.id = p_id and i.invited_email is not null and lower(i.invited_email) = lower(v_email)
  ) then
    raise exception 'Invitación no válida' using errcode = 'P0002';
  end if;
  return private.accept_invitation_row(p_id);
end;
$$;

create or replace function public.decline_invitation_by_id(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  select u.email into v_email from public.users u where u.id = auth.uid();
  update public.inventory_invitations i
     set declined_at = now()
   where i.id = p_id
     and i.invited_email is not null and lower(i.invited_email) = lower(v_email)
     and i.accepted_at is null and i.revoked_at is null and i.declined_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Invitación no válida' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory uuid;
  v_role text;
begin
  select i.inventory_id into v_inventory from public.inventory_invitations i where i.id = p_id;
  if v_inventory is null then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;
  v_role := private.inventory_role(v_inventory);
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'No tienes permiso para revocar invitaciones' using errcode = '42501';
  end if;
  update public.inventory_invitations
     set revoked_at = now()
   where id = p_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Transferencia de propiedad: solo el propietario, a un colaborador existente.
create or replace function public.transfer_ownership(p_inventory uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select i.owner_id into v_owner from public.inventories i where i.id = p_inventory;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Solo el propietario puede transferir la propiedad' using errcode = '42501';
  end if;
  if p_new_owner = v_owner then
    raise exception 'Ya eres el propietario' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.inventory_members m
     where m.inventory_id = p_inventory and m.user_id = p_new_owner
  ) then
    raise exception 'La persona debe ser colaboradora del inventario' using errcode = '22023';
  end if;

  delete from public.inventory_members
   where inventory_id = p_inventory and user_id = p_new_owner;
  update public.inventories set owner_id = p_new_owner where id = p_inventory;
  insert into public.inventory_members (inventory_id, user_id, role)
  values (p_inventory, v_owner, 'admin');
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPCs del proceso programado (SOLO service_role)
-- ---------------------------------------------------------------------

-- Reserva (de forma atómica e idempotente) los envíos de correo que ya vencieron.
-- Re-verifica el stock actual: si el producto se recuperó, no se envía nada.
create or replace function public.claim_alert_deliveries()
returns table (
  alert_id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  inventory_id uuid,
  inventory_name text,
  product_id uuid,
  product_name text,
  kind text,
  level text,
  quantity numeric,
  unit text,
  min_stock numeric,
  expiry_date date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select
      a.id as d_alert_id,
      a.inventory_id as d_inventory_id,
      a.kind as d_kind,
      case
        when a.kind = 'stock' then p.stock_status
        when p.expiry_date < private.app_today() then 'expired'
        else 'soon'
      end as d_level,
      p.id as d_product_id,
      r.user_id as d_user_id
    from public.stock_alerts a
    join public.products p on p.id = a.product_id
    cross join lateral private.notification_recipients(a.inventory_id, a.level) r
    where a.status = 'pending'
      and r.email_enabled
      and a.created_at + make_interval(mins => r.delay_minutes) <= now()
      and (
        (a.kind = 'stock' and p.stock_status in ('low', 'out'))
        or (a.kind = 'expiry' and p.expiry_date is not null and p.quantity > 0
            and p.expiry_date <= private.app_today() + 7)
      )
  ),
  claimed as (
    insert into public.alert_deliveries as d (alert_id, user_id, status, attempts, claimed_at)
    select due.d_alert_id, due.d_user_id, 'claimed', 1, now() from due
    on conflict on constraint alert_deliveries_pkey do update
      set status = 'claimed', claimed_at = now(), attempts = d.attempts + 1
      where d.attempts < 5
        and (d.status = 'failed'
             or (d.status = 'claimed' and d.claimed_at < now() - interval '10 minutes'))
    returning d.alert_id as c_alert_id, d.user_id as c_user_id
  )
  select
    due.d_alert_id,
    due.d_user_id,
    u.email,
    u.display_name,
    due.d_inventory_id,
    inv.name,
    p.id,
    p.name,
    due.d_kind,
    due.d_level,
    p.quantity,
    p.unit,
    p.min_stock,
    p.expiry_date
  from due
  join claimed on claimed.c_alert_id = due.d_alert_id and claimed.c_user_id = due.d_user_id
  join public.users u on u.id = due.d_user_id
  join public.inventories inv on inv.id = due.d_inventory_id
  join public.products p on p.id = due.d_product_id
  order by u.email, inv.name, p.name;
end;
$$;

create or replace function public.complete_alert_deliveries(
  p_alert_ids uuid[],
  p_user_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.alert_deliveries
     set status = case when p_ok then 'sent' else 'failed' end,
         sent_at = case when p_ok then now() else null end,
         error = case when p_ok then null else left(p_error, 500) end
   where alert_id = any (p_alert_ids)
     and user_id = p_user_id
     and status = 'claimed';
$$;

-- Cierra las alertas cuyos destinatarios ya fueron atendidos
create or replace function public.finalize_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with finished as (
    select a.id
      from public.stock_alerts a
     where a.status = 'pending'
       and not exists (
         select 1
           from private.notification_recipients(a.inventory_id, a.level) r
          where r.email_enabled
            and not exists (
              select 1 from public.alert_deliveries d
               where d.alert_id = a.id and d.user_id = r.user_id
                 and (d.status = 'sent'
                      or (d.attempts >= 5 and (d.status = 'failed'
                                               or d.claimed_at < now() - interval '10 minutes')))
            )
       )
  )
  update public.stock_alerts a
     set status = case
           when exists (select 1 from public.alert_deliveries d
                         where d.alert_id = a.id and d.status = 'sent') then 'sent'
           else 'skipped'
         end,
         sent_at = now(),
         updated_at = now()
   where a.id in (select id from finished);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mantenimiento: avisos de vencimiento + limpieza
create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := private.app_today();
  v_state text;
  v_days integer;
  v_min_delay integer;
  v_existing uuid;
  v_message text;
  v_expiry_flagged integer := 0;
  v_cleaned integer := 0;
  v_n integer;
begin
  for r in
    select p.id, p.inventory_id, p.name, p.expiry_date, p.quantity, p.expiry_alert_state
      from public.products p
     where p.expiry_date is not null
       and p.quantity > 0
       and p.expiry_date <= v_today + 7
  loop
    v_state := case when r.expiry_date < v_today then 'expired' else 'soon' end;
    continue when r.expiry_alert_state = v_state;

    update public.products set expiry_alert_state = v_state where id = r.id;

    v_days := r.expiry_date - v_today;
    v_message := case
      when v_state = 'expired' and v_days = -1 then r.name || ' venció ayer.'
      when v_state = 'expired' then r.name || ' venció hace ' || (-v_days) || ' días.'
      when v_days = 0 then r.name || ' vence hoy.'
      when v_days = 1 then r.name || ' vence mañana.'
      else r.name || ' vence en ' || v_days || ' días.'
    end;

    select min(x.delay_minutes) into v_min_delay
      from private.notification_recipients(r.inventory_id, v_state) x
     where x.email_enabled;

    select a.id into v_existing
      from public.stock_alerts a
     where a.product_id = r.id and a.kind = 'expiry' and a.status = 'pending';

    if v_existing is null then
      insert into public.stock_alerts (inventory_id, product_id, kind, level, quantity, scheduled_at)
      values (r.inventory_id, r.id, 'expiry', v_state, r.quantity,
              now() + make_interval(mins => coalesce(v_min_delay, 30)));
    else
      update public.stock_alerts
         set level = v_state, quantity = r.quantity, updated_at = now()
       where id = v_existing;
    end if;

    delete from public.notifications
     where product_id = r.id and type in ('expiring', 'expired') and read_at is null;
    insert into public.notifications (inventory_id, user_id, product_id, type, message)
    select r.inventory_id, x.user_id, r.id,
           case v_state when 'expired' then 'expired' else 'expiring' end,
           v_message
      from private.notification_recipients(r.inventory_id, v_state) x
     where x.in_app_enabled;

    v_expiry_flagged := v_expiry_flagged + 1;
  end loop;

  delete from public.shopping_list
   where is_bought and bought_at < now() - interval '14 days';
  get diagnostics v_n = row_count; v_cleaned := v_cleaned + v_n;

  delete from public.stock_alerts
   where status <> 'pending' and updated_at < now() - interval '30 days';
  get diagnostics v_n = row_count; v_cleaned := v_cleaned + v_n;

  delete from public.notifications
   where read_at is not null and read_at < now() - interval '60 days';
  get diagnostics v_n = row_count; v_cleaned := v_cleaned + v_n;

  return jsonb_build_object('expiry_flagged', v_expiry_flagged, 'cleaned', v_cleaned);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Permisos
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Tablas (RLS decide las filas; aquí se limitan las columnas y operaciones)
grant select on public.users to authenticated;
grant update (display_name) on public.users to authenticated;

grant select, insert, delete on public.inventories to authenticated;
grant update (name, description, icon, color) on public.inventories to authenticated;

grant select, delete on public.inventory_members to authenticated;
grant update (role) on public.inventory_members to authenticated;

grant select on public.inventory_invitations to authenticated;

-- En UPDATE se omiten id e inventory_id: nada puede "moverse" a otro inventario.
grant select, insert, delete on public.locations to authenticated;
grant update (name, icon, color, sort_order) on public.locations to authenticated;
grant select, insert, delete on public.categories to authenticated;
grant update (name, icon, color, sort_order) on public.categories to authenticated;
grant select, insert, delete on public.subcategories to authenticated;
grant update (name, sort_order, category_id) on public.subcategories to authenticated;
grant select, insert, delete on public.custom_units to authenticated;
grant select, insert, delete on public.products to authenticated;
grant update (name, location_id, category_id, subcategory_id, quantity, unit, min_stock,
              brand, expiry_date, notes, image_path, updated_by)
  on public.products to authenticated;
grant select on public.inventory_movements to authenticated;
grant select, insert, delete on public.shopping_list to authenticated;
grant update (name, quantity_needed, unit, note, priority, is_bought, bought_at, bought_by)
  on public.shopping_list to authenticated;
grant select on public.stock_alerts to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select on public.inventory_overview to authenticated;

-- service_role (backend programado) ve todo
grant all on all tables in schema public to service_role;

-- RPCs del cliente
grant execute on function public.server_now() to authenticated;
grant execute on function public.adjust_product_quantity(uuid, numeric, text) to authenticated;
grant execute on function public.set_product_quantity(uuid, numeric, text) to authenticated;
grant execute on function public.delete_location(uuid, text, uuid) to authenticated;
grant execute on function public.delete_category(uuid, text, uuid) to authenticated;
grant execute on function public.mark_shopping_item_bought(uuid, numeric) to authenticated;
grant execute on function public.seed_example_data(uuid) to authenticated;
grant execute on function public.remove_example_data(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, text, integer) to authenticated;
grant execute on function public.get_invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.decline_invitation(text) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.accept_invitation_by_id(uuid) to authenticated;
grant execute on function public.decline_invitation_by_id(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- RPCs del proceso programado
grant execute on function public.claim_alert_deliveries() to service_role;
grant execute on function public.complete_alert_deliveries(uuid[], uuid, boolean, text) to service_role;
grant execute on function public.finalize_alerts() to service_role;
grant execute on function public.run_maintenance() to service_role;

-- Funciones privadas: usadas por políticas, vistas y triggers
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11. Realtime
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'inventories', 'inventory_members', 'products', 'inventory_movements',
      'shopping_list', 'notifications', 'stock_alerts',
      'locations', 'categories', 'subcategories', 'custom_units'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
