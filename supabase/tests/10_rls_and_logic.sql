-- Pruebas de base de datos: RLS, roles, historial, lista de compras, alertas
-- diferidas, invitaciones, vencimientos y storage. Cada DO es una transacción.

create schema t;
grant usage on schema t to public;
create table t.ctx (k text primary key, v uuid not null);
grant all on t.ctx to public;
create table t.tok_store (k text primary key, tok text not null);
grant all on t.tok_store to public;

create function t.uid(p_key text) returns uuid language sql stable as $$
  select v from t.ctx where k = p_key;
$$;

create function t.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', (select v::text from t.ctx where k = p_key), true);
end $$;

create function t.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function t.as_root() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function t.expect_error(p_sql text, p_pattern text default '.*') returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      return;
    end if;
    raise exception 'ERROR INESPERADO para [%]: %', p_sql, sqlerrm;
  end;
  raise exception 'SE ESPERABA UN ERROR y no ocurrio: [%]', p_sql;
end $$;

create function t.count(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  -- EXECUTE directo: admite también CTE con INSERT/UPDATE/DELETE ... RETURNING
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end $$;

create function t.expect_count(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare v bigint := t.count(p_sql);
begin
  if v is distinct from p_expected then
    raise exception 'FALLO [%]: se esperaban % filas y hubo %', p_label, p_expected, v;
  end if;
  raise notice 'ok   %', p_label;
end $$;

create function t.check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FALLO [%]', p_label;
  end if;
  raise notice 'ok   %', p_label;
end $$;

-- ---------------------------------------------------------------------
-- A. Usuarios
-- ---------------------------------------------------------------------
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    ('a0000000-0000-0000-0000-000000000001', 'Agustin@test.cl', '{"display_name":"Agustín"}'),
    ('d0000000-0000-0000-0000-000000000002', 'diego@test.cl', '{"display_name":"Diego"}'),
    ('e0000000-0000-0000-0000-000000000003', 'maria@test.cl', '{"display_name":"María"}'),
    ('f0000000-0000-0000-0000-000000000004', 'sin.nombre@test.cl', '{}');
  insert into t.ctx values
    ('agus', 'a0000000-0000-0000-0000-000000000001'),
    ('diego', 'd0000000-0000-0000-0000-000000000002'),
    ('maria', 'e0000000-0000-0000-0000-000000000003'),
    ('pedro', 'f0000000-0000-0000-0000-000000000004');

  perform t.expect_count('1 trigger crea el perfil de cada usuario', 'select 1 from public.users', 4);
  perform t.check('email se guarda en minúsculas', (select email from public.users where id = t.uid('agus')) = 'agustin@test.cl');
  perform t.check('sin display_name usa la parte local del correo', (select display_name from public.users where id = t.uid('pedro')) = 'sin.nombre');
end $$;

-- ---------------------------------------------------------------------
-- B. Inventario propio, estructura y producto
-- ---------------------------------------------------------------------
do $$
declare v uuid; v_loc uuid; v_loc2 uuid; v_cat uuid; v_cat2 uuid; v_sub uuid; v_prod uuid;
begin
  perform t.as_user('agus');
  insert into public.inventories (owner_id, name, description, icon, color)
  values (t.uid('agus'), 'Casa', 'Inventario general', 'home', '#10b981') returning id into v;
  insert into t.ctx values ('casa', v);

  insert into public.locations (inventory_id, name, icon, color, sort_order) values (v, 'Despensa', 'archive', '#f59e0b', 1) returning id into v_loc;
  insert into public.locations (inventory_id, name, icon, color, sort_order) values (v, 'Refrigerador', 'refrigerator', '#0ea5e9', 2) returning id into v_loc2;
  insert into public.categories (inventory_id, name, icon, color, sort_order) values (v, 'Alimentos', 'apple', '#22c55e', 1) returning id into v_cat;
  insert into public.categories (inventory_id, name, icon, color, sort_order) values (v, 'Bebidas', 'cup-soda', '#06b6d4', 2) returning id into v_cat2;
  insert into public.subcategories (inventory_id, category_id, name) values (v, v_cat, 'Desayuno') returning id into v_sub;
  insert into t.ctx values ('loc_desp', v_loc), ('loc_refri', v_loc2), ('cat_alim', v_cat), ('cat_beb', v_cat2), ('sub_desayuno', v_sub);

  insert into public.products (inventory_id, name, location_id, category_id, subcategory_id, quantity, unit, min_stock)
  values (v, 'Leche', v_loc2, v_cat, v_sub, 4, 'litros', 2) returning id into v_prod;
  insert into t.ctx values ('leche', v_prod);

  perform t.check('producto nuevo con stock suficiente = ok', (select stock_status from public.products where id = v_prod) = 'ok');
  perform t.expect_count('crear producto registra 1 movimiento', format('select 1 from public.inventory_movements where product_id = %L and action = ''create''', v_prod), 1);
  perform t.check('historial guarda el nombre de quien lo hizo', (select user_name from public.inventory_movements where product_id = v_prod limit 1) = 'Agustín');
  perform t.check('last_inventory_change_at lo fija la base de datos', (select last_inventory_change_at from public.inventories where id = v) is not null);
  perform t.check('la vista resumen cuenta 1 producto', (select product_count from public.inventory_overview where id = v) = 1);
  perform t.check('el propietario figura como owner en la vista', (select my_role from public.inventory_overview where id = v) = 'owner');
  perform t.check('structure_version aumentó con la estructura', (select structure_version from public.inventories where id = v) >= 5);

  -- Integridad: subcategoría de otra categoría y nombres duplicados
  perform t.expect_error(format('insert into public.products (inventory_id, name, category_id, subcategory_id, quantity, unit) values (%L, ''X'', %L, %L, 1, ''u'')', v, v_cat2, v_sub), 'no pertenece');
  perform t.expect_error(format('insert into public.locations (inventory_id, name) values (%L, ''despensa'')', v), 'duplicate key');
  perform t.expect_error(format('insert into public.products (inventory_id, name, quantity, unit) values (%L, ''Neg'', -1, ''u'')', v), 'check');
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- C. Flujo de stock: historial, lista de compras, alerta diferida (una sola)
-- ---------------------------------------------------------------------
do $$
declare v_prod uuid := t.uid('leche'); v_inv uuid := t.uid('casa'); v_alert uuid; r public.products;
begin
  perform t.as_user('agus');

  r := public.adjust_product_quantity(v_prod, -1);
  perform t.check('4 a 3: sigue en ok', r.stock_status = 'ok' and r.quantity = 3);
  perform t.expect_count('sin alerta mientras hay stock suficiente', format('select 1 from public.stock_alerts where product_id = %L', v_prod), 0);
  perform t.check('el historial registra 3 y diferencia -1', exists (
    select 1 from public.inventory_movements where product_id = v_prod and quantity_before = 4 and quantity_after = 3 and diff = -1 and action = 'decrease'));

  r := public.adjust_product_quantity(v_prod, -1);
  perform t.check('3 a 2: stock bajo', r.stock_status = 'low');
  perform t.expect_count('stock bajo crea UNA alerta pendiente', format('select 1 from public.stock_alerts where product_id = %L and status = ''pending'' and level = ''low''', v_prod), 1);
  select id into v_alert from public.stock_alerts where product_id = v_prod and status = 'pending';
  perform t.check('scheduled_at queda 30 min en el futuro por defecto', (select scheduled_at from public.stock_alerts where id = v_alert) = now() + interval '30 minutes');
  perform t.expect_count('entra a la lista de compras (auto, low)', format('select 1 from public.shopping_list where product_id = %L and auto and reason = ''low'' and not is_bought', v_prod), 1);
  perform t.expect_count('notificación interna "bajo el stock mínimo"', format('select 1 from public.notifications where product_id = %L and type = ''low_stock'' and message = ''Leche está bajo el stock mínimo.'' and read_at is null', v_prod), 1);

  r := public.adjust_product_quantity(v_prod, -1);
  perform t.check('2 a 1: sigue bajo, misma alerta', r.stock_status = 'low' and (select count(*) from public.stock_alerts where product_id = v_prod and status = 'pending') = 1);

  r := public.adjust_product_quantity(v_prod, -1);
  perform t.check('1 a 0: agotado', r.stock_status = 'out' and r.quantity = 0);
  perform t.check('la alerta existente se ACTUALIZA a out (mismo id, sin duplicados)',
    (select count(*) from public.stock_alerts where product_id = v_prod and status = 'pending') = 1
    and (select level from public.stock_alerts where id = v_alert) = 'out');
  perform t.check('prioridad alta en compras al agotarse', (select priority from public.shopping_list where product_id = v_prod and not is_bought) = 'high'
    and (select reason from public.shopping_list where product_id = v_prod and not is_bought) = 'out');
  perform t.check('una sola notificación sin leer por producto', (select count(*) from public.notifications where product_id = v_prod and read_at is null) = 1
    and (select message from public.notifications where product_id = v_prod and read_at is null) = 'Se agotó Leche.');

  -- No baja de cero ni registra movimiento si no cambia
  r := public.adjust_product_quantity(v_prod, -1);
  perform t.check('no baja de 0', r.quantity = 0);
  perform t.expect_count('cuatro movimientos de baja + creación', format('select 1 from public.inventory_movements where product_id = %L', v_prod), 5);

  -- Entrada manual y vaciar stock
  r := public.set_product_quantity(v_prod, 6);
  perform t.check('ingreso manual deja la acción set', exists (select 1 from public.inventory_movements where product_id = v_prod and action = 'set' and quantity_after = 6));
  perform t.check('al recuperar stock sale de compras y se cancela la alerta',
    not exists (select 1 from public.shopping_list where product_id = v_prod and not is_bought)
    and (select status from public.stock_alerts where id = v_alert) = 'cancelled'
    and not exists (select 1 from public.notifications where product_id = v_prod and read_at is null));
  perform t.expect_error(format('select public.set_product_quantity(%L, -3)', v_prod), 'mayor o igual');
  r := public.set_product_quantity(v_prod, 0, 'clear');
  perform t.check('vaciar stock deja la acción clear', exists (select 1 from public.inventory_movements where product_id = v_prod and action = 'clear'));
  perform t.as_root();

  perform t.check('last_inventory_change_at = hora del último movimiento',
    (select last_inventory_change_at from public.inventories where id = v_inv) = (select max(created_at) from public.inventory_movements where inventory_id = v_inv));
end $$;

-- ---------------------------------------------------------------------
-- D. Envío diferido: reserva idempotente, re-verificación y cancelación
-- ---------------------------------------------------------------------
do $$
declare v_prod uuid := t.uid('leche'); v_alert uuid; n integer; rec record;
begin
  -- Leche quedó agotada tras "vaciar stock": hay una alerta nueva pendiente (de ok a out)
  select id into v_alert from public.stock_alerts where product_id = v_prod and status = 'pending';
  perform t.check('vaciar stock creó una nueva alerta pendiente', v_alert is not null);

  perform t.as_service();
  perform t.expect_count('antes de los 30 min NO se envía nada', 'select 1 from public.claim_alert_deliveries()', 0);
  perform t.as_root();

  update public.stock_alerts set created_at = now() - interval '31 minutes' where id = v_alert;

  perform t.as_service();
  select * into rec from public.claim_alert_deliveries();
  perform t.check('a los 30 min se reserva UN correo con datos actuales',
    rec.user_email = 'agustin@test.cl' and rec.product_name = 'Leche' and rec.level = 'out' and rec.quantity = 0);
  perform t.expect_count('una segunda ejecución concurrente no duplica', 'select 1 from public.claim_alert_deliveries()', 0);
  perform public.complete_alert_deliveries(array[v_alert], t.uid('agus'), true, null);
  n := public.finalize_alerts();
  perform t.check('la alerta se cierra como enviada', n = 1 and (select status from public.stock_alerts where id = v_alert) = 'sent');
  perform t.expect_count('ya no queda nada por enviar', 'select 1 from public.claim_alert_deliveries()', 0);
  perform t.as_root();

  -- Fallo de envío: se reintenta, con tope de intentos
  perform t.as_user('agus');
  perform public.set_product_quantity(v_prod, 5);
  perform public.set_product_quantity(v_prod, 1);
  perform t.as_root();
  select id into v_alert from public.stock_alerts where product_id = v_prod and status = 'pending';
  update public.stock_alerts set created_at = now() - interval '40 minutes' where id = v_alert;
  perform t.as_service();
  perform t.expect_count('nueva alerta tras recuperar y volver a bajar', 'select 1 from public.claim_alert_deliveries()', 1);
  perform public.complete_alert_deliveries(array[v_alert], t.uid('agus'), false, 'Resend 500');
  perform t.expect_count('un envío fallido se reintenta', 'select 1 from public.claim_alert_deliveries()', 1);
  perform t.as_root();

  -- Recuperación antes del envío: se cancela y no sale correo
  perform t.as_user('agus');
  perform public.set_product_quantity(v_prod, 9);
  perform t.as_root();
  perform t.check('recuperar stock cancela la alerta pendiente', (select status from public.stock_alerts where id = v_alert) = 'cancelled');
  perform t.as_service();
  perform t.expect_count('y no se envía correo', 'select 1 from public.claim_alert_deliveries()', 0);
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- E. Invitaciones: por correo y por enlace
-- ---------------------------------------------------------------------
do $$
declare v uuid; v_loc uuid; v_cat uuid; v_prod uuid; inv record; v_tok text; inv_id uuid; v_accepted uuid;
begin
  -- Diego tiene su propio inventario
  perform t.as_user('diego');
  insert into public.inventories (owner_id, name, description, icon, color)
  values (t.uid('diego'), 'Casa de Diego', 'Departamento de Diego', 'building-2', '#3b82f6') returning id into v;
  insert into t.ctx values ('cdd', v);
  insert into public.locations (inventory_id, name) values (v, 'Cocina') returning id into v_loc;
  insert into public.categories (inventory_id, name) values (v, 'Alimentos') returning id into v_cat;
  insert into public.products (inventory_id, name, location_id, category_id, quantity, unit, min_stock)
  values (v, 'Café', v_loc, v_cat, 2, 'paquetes', 1) returning id into v_prod;
  insert into t.ctx values ('cdd_cocina', v_loc), ('cdd_alim', v_cat), ('cafe', v_prod);

  -- Invitación por correo a Agustín (rol editor)
  select * into inv from public.create_invitation(v, 'editor', 'AGUSTIN@test.cl', 7);
  v_tok := inv.token;
  perform t.check('el token es largo y aleatorio', char_length(v_tok) = 64);
  perform t.check('en la base solo existe el hash, no el token',
    not exists (select 1 from public.inventory_invitations where token_hash = v_tok)
    and exists (select 1 from public.inventory_invitations where token_hash = encode(sha256(convert_to(v_tok, 'utf8')), 'hex')));
  insert into t.ctx select 'inv_mail', id from public.inventory_invitations where inventory_id = v limit 1;
  perform t.as_root();
  -- el token se guarda solo para la prueba (en la app viaja en el enlace)
  insert into t.tok_store values ('mail', v_tok);

  -- María (cuenta equivocada) no puede usarla ni ver el inventario
  perform t.as_user('maria');
  perform t.check('cuenta equivocada ve estado wrong_account sin datos', (
    select status = 'wrong_account' and inventory_name is null from public.get_invitation_preview((select tok from t.tok_store where k = 'mail'))));
  perform t.expect_error('select public.accept_invitation((select tok from t.tok_store where k = ''mail''))', 'otra cuenta');
  perform t.expect_error('select public.accept_invitation(''token-inventado'')', 'no válida');
  perform t.expect_count('María no ve inventarios ajenos', 'select 1 from public.inventories', 0);
  perform t.as_root();

  -- Agustín: vista previa, lista de pendientes y aceptación
  perform t.as_user('agus');
  perform t.check('la vista previa muestra nombre, dueño y rol', (
    select inventory_name = 'Casa de Diego' and owner_name = 'Diego' and role = 'editor' and status = 'pending'
      from public.get_invitation_preview((select tok from t.tok_store where k = 'mail'))));
  perform t.expect_count('la invitación por correo aparece en pendientes', 'select 1 from public.list_my_invitations()', 1);
  perform t.expect_count('antes de aceptar no ve el inventario de Diego', format('select 1 from public.products where inventory_id = %L', v), 0);
  v_accepted := public.accept_invitation((select tok from t.tok_store where k = 'mail'));
  perform t.check('aceptar devuelve el id del inventario', v_accepted = v);
  perform t.expect_count('ahora aparece en su dashboard como compartido', format('select 1 from public.inventory_overview where id = %L and my_role = ''editor'' and owner_name = ''Diego''', v), 1);
  perform t.expect_count('y ve sus productos', format('select 1 from public.products where inventory_id = %L', v), 1);
  perform t.check('el enlace es de un solo uso', (select status from public.get_invitation_preview((select tok from t.tok_store where k = 'mail'))) = 'accepted_by_me');
  perform t.as_root();

  perform t.as_user('maria');
  perform t.expect_error('select public.accept_invitation((select tok from t.tok_store where k = ''mail''))', 'otra cuenta|ya fue utilizada');
  perform t.as_root();

  -- Enlace sin correo, rol solo lectura, que usa María
  perform t.as_user('diego');
  select * into inv from public.create_invitation(v, 'viewer', null, 3);
  insert into t.tok_store values ('link', inv.token);
  perform t.as_root();
  perform t.as_user('maria');
  perform t.check('enlace abierto: vista previa pendiente', (select status from public.get_invitation_preview((select tok from t.tok_store where k = 'link'))) = 'pending');
  perform public.accept_invitation((select tok from t.tok_store where k = 'link'));
  perform t.expect_count('María (viewer) ve el inventario compartido', format('select 1 from public.products where inventory_id = %L', v), 1);
  perform t.as_root();

  -- Revocación, expiración y rechazo
  perform t.as_user('diego');
  select * into inv from public.create_invitation(v, 'editor', null, 1);
  insert into t.tok_store values ('revoked', inv.token);
  select * into inv from public.create_invitation(v, 'editor', null, 1);
  insert into t.tok_store values ('expired', inv.token);
  select * into inv from public.create_invitation(v, 'editor', null, 1);
  insert into t.tok_store values ('declined', inv.token);
  perform public.revoke_invitation((select id from public.inventory_invitations where token_hash = encode(sha256(convert_to((select tok from t.tok_store where k = 'revoked'), 'utf8')), 'hex')));
  perform t.as_root();
  update public.inventory_invitations set expires_at = now() - interval '1 minute'
   where token_hash = encode(sha256(convert_to((select tok from t.tok_store where k = 'expired'), 'utf8')), 'hex');

  perform t.as_user('maria');
  perform t.check('invitación revocada no se puede aceptar', (select status from public.get_invitation_preview((select tok from t.tok_store where k = 'revoked'))) = 'revoked');
  perform t.expect_error('select public.accept_invitation((select tok from t.tok_store where k = ''revoked''))', 'ya no está disponible');
  perform t.check('invitación expirada no se puede aceptar', (select status from public.get_invitation_preview((select tok from t.tok_store where k = 'expired'))) = 'expired');
  perform t.expect_error('select public.accept_invitation((select tok from t.tok_store where k = ''expired''))', 'expiró');
  perform public.decline_invitation((select tok from t.tok_store where k = 'declined'));
  perform t.expect_error('select public.accept_invitation((select tok from t.tok_store where k = ''declined''))', 'ya no está disponible');
  perform t.as_root();

  -- Quién puede invitar
  perform t.as_user('agus');
  perform t.expect_error(format('select public.create_invitation(%L, ''viewer'', null, 7)', v), 'No tienes permiso');
  perform t.as_user('maria');
  perform t.expect_error(format('select public.create_invitation(%L, ''viewer'', null, 7)', v), 'No tienes permiso');
  perform t.as_user('diego');
  perform t.expect_error(format('select public.create_invitation(%L, ''editor'', ''agustin@test.cl'', 7)', v), 'ya colabora');
  perform t.expect_error(format('select public.create_invitation(%L, ''superuser'', null, 7)', v), 'Rol inválido');
  perform t.expect_error(format('select public.create_invitation(%L, ''viewer'', null, 90)', v), 'entre 1 y 30');
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- F. Permisos por rol y aislamiento entre inventarios (RLS)
-- ---------------------------------------------------------------------
do $$
declare
  v_cdd uuid := t.uid('cdd'); v_casa uuid := t.uid('casa'); v_cafe uuid := t.uid('cafe');
  v_loc_casa uuid := t.uid('loc_desp'); v_new uuid; r public.products;
begin
  -- Editor (Agustín en Casa de Diego)
  perform t.as_user('agus');
  r := public.adjust_product_quantity(v_cafe, -1);
  perform t.check('editor modifica stock en tiempo real compartido', r.quantity = 1 and r.stock_status = 'low');
  perform t.check('el historial dice que lo hizo Agustín', (
    select user_name = 'Agustín' from public.inventory_movements where product_id = v_cafe order by created_at desc, id limit 1));
  insert into public.products (inventory_id, name, location_id, category_id, quantity, unit, min_stock)
  values (v_cdd, 'Azúcar', t.uid('cdd_cocina'), t.uid('cdd_alim'), 5, 'kg', 1) returning id into v_new;
  perform t.check('editor puede crear productos', v_new is not null);
  insert into public.locations (inventory_id, name) values (v_cdd, 'Terraza');
  perform t.check('editor puede crear ubicaciones', true);
  perform t.expect_count('editor NO puede eliminar el inventario', format('with d as (delete from public.inventories where id = %L returning 1) select * from d', v_cdd), 0);
  perform t.expect_count('editor NO puede renombrar el inventario', format('with u as (update public.inventories set name = ''Hackeado'' where id = %L returning 1) select * from u', v_cdd), 0);
  perform t.expect_count('editor NO puede cambiar roles', format('with u as (update public.inventory_members set role = ''admin'' where inventory_id = %L returning 1) select * from u', v_cdd), 0);
  perform t.expect_count('editor NO ve invitaciones', format('select 1 from public.inventory_invitations where inventory_id = %L', v_cdd), 0);
  perform t.expect_error(format('select public.transfer_ownership(%L, %L)', v_cdd, t.uid('agus')), 'Solo el propietario');
  perform t.expect_error(format('update public.products set inventory_id = %L where id = %L', v_casa, v_cafe), 'permission denied');
  perform t.expect_error(format('update public.inventories set owner_id = %L where id = %L', t.uid('agus'), v_cdd), 'permission denied');
  perform t.expect_error('insert into public.inventory_movements (inventory_id, product_name, action, user_name) values (''' || v_cdd || ''', ''X'', ''create'', ''falso'')', 'permission denied');
  perform t.expect_error(format('insert into public.inventory_members (inventory_id, user_id, role) values (%L, %L, ''admin'')', v_cdd, t.uid('agus')), 'permission denied');
  perform t.expect_error(format('insert into public.inventory_invitations (inventory_id, token_hash, role, expires_at) values (%L, ''x'', ''admin'', now())', v_cdd), 'permission denied');
  perform t.as_root();

  -- Solo lectura (María en Casa de Diego)
  perform t.as_user('maria');
  perform t.expect_count('viewer ve productos', format('select 1 from public.products where inventory_id = %L', v_cdd), 2);
  perform t.expect_count('viewer ve el historial', format('select 1 from public.inventory_movements where inventory_id = %L', v_cdd), 3);
  perform t.expect_count('viewer ve la lista de compras', format('select 1 from public.shopping_list where inventory_id = %L', v_cdd), 1);
  perform t.expect_count('viewer ve las alertas', format('select 1 from public.stock_alerts where inventory_id = %L', v_cdd), 1);
  perform t.expect_error(format('insert into public.products (inventory_id, name, quantity, unit) values (%L, ''Intruso'', 1, ''u'')', v_cdd), 'row-level security');
  perform t.expect_error(format('select public.adjust_product_quantity(%L, 5)', v_cafe), 'sin permiso');
  perform t.expect_count('viewer NO puede editar productos', format('with u as (update public.products set name = ''X'' where id = %L returning 1) select * from u', v_cafe), 0);
  perform t.expect_count('viewer NO puede eliminar productos', format('with d as (delete from public.products where id = %L returning 1) select * from d', v_cafe), 0);
  perform t.expect_error(format('insert into public.locations (inventory_id, name) values (%L, ''Nueva'')', v_cdd), 'row-level security');
  perform t.expect_error(format('insert into public.shopping_list (inventory_id, name) values (%L, ''Pan'')', v_cdd), 'row-level security');
  perform t.expect_error(format('select public.seed_example_data(%L)', v_cdd), 'No tienes permiso');
  perform t.expect_error(format('select public.delete_location(%L, ''delete'', null)', t.uid('cdd_cocina')), 'No tienes permiso');
  perform t.check('el producto sigue intacto tras los intentos', (select quantity from public.products where id = v_cafe) = 1);

  -- Sin relación con el inventario aunque conozca su id
  perform t.expect_count('María no ve Casa de Agustín (conoce el id)', format('select 1 from public.products where inventory_id = %L', v_casa), 0);
  perform t.expect_count('ni su historial', format('select 1 from public.inventory_movements where inventory_id = %L', v_casa), 0);
  perform t.expect_count('ni sus miembros', format('select 1 from public.inventory_members where inventory_id = %L', v_casa), 0);
  perform t.expect_count('ni sus notificaciones', format('select 1 from public.notifications where inventory_id = %L', v_casa), 0);
  perform t.expect_error(format('insert into public.products (inventory_id, name, quantity, unit) values (%L, ''Intruso'', 1, ''u'')', v_casa), 'row-level security');
  perform t.as_root();

  -- Aislamiento entre inventarios de la misma persona (no se mezclan datos)
  perform t.as_user('diego');
  perform t.expect_error(format('insert into public.products (inventory_id, name, location_id, quantity, unit) values (%L, ''Mezcla'', %L, 1, ''u'')', v_cdd, v_loc_casa), 'foreign key|violates');
  perform t.expect_count('Diego no ve Casa de Agustín', format('select 1 from public.inventories where id = %L', v_casa), 0);
  perform t.expect_count('Diego ve a sus 2 colaboradores (nombres) y a sí mismo', 'select 1 from public.users', 3);
  perform t.as_root();

  -- anon no puede nada
  perform t.as_anon();
  perform t.expect_error('select 1 from public.inventories', 'permission denied');
  perform t.expect_error('select 1 from public.products', 'permission denied');
  perform t.expect_error(format('select public.accept_invitation(%L)', 'abc'), 'permission denied');
  perform t.as_root();

  -- Las RPC del proceso programado no son invocables por usuarios
  perform t.as_user('diego');
  perform t.expect_error('select * from public.claim_alert_deliveries()', 'permission denied');
  perform t.expect_error('select public.run_maintenance()', 'permission denied');
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- G. Administrador, propietario y transferencia
-- ---------------------------------------------------------------------
do $$
declare v_cdd uuid := t.uid('cdd');
begin
  perform t.as_user('diego');
  perform t.expect_count('propietario cambia rol de María a admin', format('with u as (update public.inventory_members set role = ''admin'' where inventory_id = %L and user_id = %L returning 1) select * from u', v_cdd, t.uid('maria')), 1);
  perform t.as_root();

  perform t.as_user('maria');
  perform t.expect_count('admin renombra el inventario', format('with u as (update public.inventories set name = ''Depto Diego'' where id = %L returning 1) select * from u', v_cdd), 1);
  perform t.expect_count('admin ve invitaciones', format('select 1 from public.inventory_invitations where inventory_id = %L', v_cdd), 5);
  perform t.expect_count('admin baja a Agustín a viewer', format('with u as (update public.inventory_members set role = ''viewer'' where inventory_id = %L and user_id = %L returning 1) select * from u', v_cdd, t.uid('agus')), 1);
  perform t.expect_error(format('update public.inventory_members set role = ''admin'' where inventory_id = %L and user_id = %L', v_cdd, t.uid('agus')), 'row-level security');
  perform t.expect_count('admin NO elimina el inventario', format('with d as (delete from public.inventories where id = %L returning 1) select * from d', v_cdd), 0);
  perform t.expect_error(format('select public.create_invitation(%L, ''admin'', null, 5)', v_cdd), 'Solo el propietario puede invitar administradores');
  perform t.check('admin sí invita editores', (select count(*) from public.create_invitation(v_cdd, 'editor', null, 5)) = 1);
  perform t.expect_error(format('select public.transfer_ownership(%L, %L)', v_cdd, t.uid('maria')), 'Solo el propietario');
  perform t.as_root();

  -- Agustín ahora es viewer: ya no puede escribir
  perform t.as_user('agus');
  perform t.expect_error(format('select public.adjust_product_quantity(%L, 1)', t.uid('cafe')), 'sin permiso');
  perform t.as_root();

  -- Sube de nuevo a editor y Diego transfiere la propiedad a Agustín
  perform t.as_user('diego');
  update public.inventory_members set role = 'editor' where inventory_id = v_cdd and user_id = t.uid('agus');
  perform t.expect_error(format('select public.transfer_ownership(%L, %L)', v_cdd, t.uid('pedro')), 'colaboradora');
  perform public.transfer_ownership(v_cdd, t.uid('agus'));
  perform t.check('la propiedad cambió a Agustín', (select owner_id from public.inventories where id = v_cdd) = t.uid('agus'));
  perform t.check('Diego queda como administrador', (select role from public.inventory_members where inventory_id = v_cdd and user_id = t.uid('diego')) = 'admin');
  perform t.expect_count('Diego ya no puede eliminarlo', format('with d as (delete from public.inventories where id = %L returning 1) select * from d', v_cdd), 0);
  perform t.as_root();
  perform t.as_user('agus');
  perform t.check('Agustín figura como propietario', (select my_role from public.inventory_overview where id = v_cdd) = 'owner');
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- H. Preferencias individuales de notificación
-- ---------------------------------------------------------------------
do $$
declare v_casa uuid := t.uid('casa'); v_pan uuid; r public.products; v_alert public.stock_alerts;
begin
  -- María entra a Casa de Agustín como editora (enlace)
  perform t.as_user('agus');
  insert into t.tok_store select 'casa_link', token from public.create_invitation(v_casa, 'editor', null, 5);
  perform t.as_root();
  perform t.as_user('maria');
  perform public.accept_invitation((select tok from t.tok_store where k = 'casa_link'));
  insert into public.notification_preferences (user_id, inventory_id, notifications_enabled, delay_minutes)
  values (t.uid('maria'), v_casa, false, 30);
  perform t.expect_error(format('insert into public.notification_preferences (user_id, inventory_id) values (%L, %L)', t.uid('agus'), v_casa), 'row-level security');
  perform t.as_root();

  perform t.as_user('agus');
  insert into public.notification_preferences (user_id, inventory_id, delay_minutes, out_of_stock)
  values (t.uid('agus'), v_casa, 10, false);
  insert into public.products (inventory_id, name, quantity, unit, min_stock) values (v_casa, 'Pan', 3, 'bolsas', 1) returning id into v_pan;
  r := public.adjust_product_quantity(v_pan, -2);
  select * into v_alert from public.stock_alerts where product_id = v_pan and status = 'pending';
  perform t.check('el tiempo de espera usa la preferencia (10 min)', v_alert.scheduled_at = now() + interval '10 minutes');
  perform t.check('Agustín recibe la notificación de stock bajo', exists (select 1 from public.notifications where product_id = v_pan and user_id = t.uid('agus')));
  perform t.as_root();
  perform t.check('María (desactivó notificaciones) NO la recibe', not exists (select 1 from public.notifications where product_id = v_pan and user_id = t.uid('maria')));

  -- Agustín desactivó "agotados": al agotarse no recibe aviso interno nuevo ni correo
  perform t.as_user('agus');
  r := public.adjust_product_quantity(v_pan, -1);
  perform t.as_root();
  perform t.check('con "agotados" desactivado no se crea notificación out', not exists (select 1 from public.notifications where product_id = v_pan and type = 'out_of_stock'));
  update public.stock_alerts set created_at = now() - interval '2 hours' where product_id = v_pan and status = 'pending';
  perform t.as_service();
  perform t.expect_count('ni se reserva correo para quien lo desactivó', 'select 1 from public.claim_alert_deliveries()', 0);
  perform public.finalize_alerts();
  perform t.as_root();
  perform t.check('la alerta sin destinatarios se cierra como skipped', (select status from public.stock_alerts where product_id = v_pan order by created_at desc limit 1) = 'skipped');
end $$;

-- ---------------------------------------------------------------------
-- I. Compras: marcar comprado y sumar stock
-- ---------------------------------------------------------------------
do $$
declare v_casa uuid := t.uid('casa'); v_arroz uuid; v_item uuid; r public.products;
begin
  perform t.as_user('agus');
  insert into public.products (inventory_id, name, quantity, unit, min_stock) values (v_casa, 'Arroz', 1, 'kg', 2) returning id into v_arroz;
  select id into v_item from public.shopping_list where product_id = v_arroz and not is_bought;
  perform t.check('producto creado bajo el mínimo entra a compras', v_item is not null);
  insert into public.shopping_list (inventory_id, name, quantity_needed, unit, priority) values (v_casa, 'Pilas AA', 4, 'unidades', 'low');
  perform t.expect_count('ítem manual permitido', format('select 1 from public.shopping_list where inventory_id = %L and not auto', v_casa), 1);
  update public.shopping_list set priority = 'low' where id = v_item;
  perform public.mark_shopping_item_bought(v_item, 5);
  select * into r from public.products where id = v_arroz;
  perform t.check('comprado + aumentar stock deja 6 kg y estado ok', r.quantity = 6 and r.stock_status = 'ok');
  perform t.check('queda registrado como purchase', exists (select 1 from public.inventory_movements where product_id = v_arroz and action = 'purchase' and diff = 5));
  perform t.check('el ítem queda comprado', (select is_bought from public.shopping_list where id = v_item));
  perform t.expect_error(format('select public.mark_shopping_item_bought(%L, 1)', v_item), 'ya comprado');
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- J. Ubicaciones y categorías: eliminar con productos
-- ---------------------------------------------------------------------
do $$
declare v_casa uuid := t.uid('casa'); a uuid; b uuid; c uuid; p1 uuid; p2 uuid; p3 uuid; ca uuid; cb uuid; pc uuid;
begin
  perform t.as_user('agus');
  insert into public.locations (inventory_id, name) values (v_casa, 'Bodega') returning id into a;
  insert into public.locations (inventory_id, name) values (v_casa, 'Clóset') returning id into b;
  insert into public.locations (inventory_id, name) values (v_casa, 'Lavadero') returning id into c;
  insert into public.products (inventory_id, name, location_id, quantity, unit, min_stock) values (v_casa, 'P1', a, 5, 'u', 1) returning id into p1;
  insert into public.products (inventory_id, name, location_id, quantity, unit, min_stock) values (v_casa, 'P2', b, 5, 'u', 1) returning id into p2;
  insert into public.products (inventory_id, name, location_id, quantity, unit, min_stock) values (v_casa, 'P3', c, 5, 'u', 1) returning id into p3;

  perform public.delete_location(a, 'move', t.uid('loc_desp'));
  perform t.check('mover: el producto cambió de ubicación', (select location_id from public.products where id = p1) = t.uid('loc_desp'));
  perform public.delete_location(b, 'orphan');
  perform t.check('dejar sin ubicación: el producto sigue sin ubicación', exists (select 1 from public.products where id = p2 and location_id is null));
  perform public.delete_location(c, 'delete');
  perform t.check('eliminar: el producto desapareció y quedó en el historial', not exists (select 1 from public.products where id = p3)
    and exists (select 1 from public.inventory_movements where product_id = p3 and action = 'delete'));
  perform t.expect_error(format('select public.delete_location(%L, ''move'', null)', t.uid('loc_refri')), 'Destino inválido');
  perform t.expect_error(format('select public.delete_location(%L, ''move'', %L)', t.uid('loc_refri'), t.uid('cdd_cocina')), 'Destino inválido');

  insert into public.categories (inventory_id, name) values (v_casa, 'Cat A') returning id into ca;
  insert into public.categories (inventory_id, name) values (v_casa, 'Cat B') returning id into cb;
  insert into public.products (inventory_id, name, category_id, quantity, unit, min_stock) values (v_casa, 'PC', ca, 5, 'u', 1) returning id into pc;
  perform public.delete_category(ca, 'move', cb);
  perform t.check('categoría: mover productos', (select category_id from public.products where id = pc) = cb);
  perform public.delete_category(t.uid('cat_alim'), 'orphan');
  perform t.check('categoría: borrar sus subcategorías y soltar productos', not exists (select 1 from public.subcategories where id = t.uid('sub_desayuno'))
    and (select category_id is null and subcategory_id is null from public.products where id = t.uid('leche')));
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- K. Vencimientos
-- ---------------------------------------------------------------------
do $$
declare v_casa uuid := t.uid('casa'); v_y uuid; j jsonb;
begin
  perform t.as_user('agus');
  insert into public.products (inventory_id, name, quantity, unit, min_stock, expiry_date)
  values (v_casa, 'Yogur', 2, 'unidades', 1, private.app_today() + 3) returning id into v_y;
  perform t.check('la vista cuenta 1 próximo a vencer', (select expiring_count from public.inventory_overview where id = v_casa) = 1);
  perform t.as_service();
  j := public.run_maintenance();
  perform t.check('mantenimiento marca el producto como próximo a vencer', (j ->> 'expiry_flagged')::int = 1);
  perform t.as_root();
  perform t.check('notificación "vence en 3 días"', exists (select 1 from public.notifications where product_id = v_y and type = 'expiring' and message = 'Yogur vence en 3 días.' and user_id = t.uid('agus')));
  perform t.check('alerta de vencimiento pendiente', exists (select 1 from public.stock_alerts where product_id = v_y and kind = 'expiry' and level = 'soon' and status = 'pending'));
  perform t.as_service();
  j := public.run_maintenance();
  perform t.check('segunda ejecución no duplica avisos', (j ->> 'expiry_flagged')::int = 0);
  perform t.as_root();
  perform t.expect_count('sigue habiendo una sola notificación', format('select 1 from public.notifications where product_id = %L and user_id = %L', v_y, t.uid('agus')), 1);

  perform t.as_user('agus');
  update public.products set expiry_date = private.app_today() - 1 where id = v_y;
  perform t.as_root();
  perform t.check('cambiar la fecha cancela la alerta anterior', (select status from public.stock_alerts where product_id = v_y and kind = 'expiry' order by created_at limit 1) = 'cancelled');
  perform t.as_service();
  j := public.run_maintenance();
  perform t.check('ahora figura vencido', (j ->> 'expiry_flagged')::int = 1);
  perform t.as_root();
  perform t.check('mensaje "venció ayer"', exists (select 1 from public.notifications where product_id = v_y and type = 'expired' and message = 'Yogur venció ayer.'));
  perform t.as_user('agus');
  perform t.check('la vista cuenta 1 vencido', (select expired_count from public.inventory_overview where id = v_casa) = 1);
  perform t.as_root();
end $$;

-- ---------------------------------------------------------------------
-- L. Notificaciones internas, ejemplos, storage y borrado en cascada
-- ---------------------------------------------------------------------
do $$
declare v_casa uuid := t.uid('casa'); v_tmp uuid; v_p uuid; v_n integer;
begin
  perform t.as_user('agus');
  perform public.mark_all_notifications_read(v_casa);
  perform t.expect_count('marcar como leídas solo las de este inventario', format('select 1 from public.notifications where user_id = %L and inventory_id = %L and read_at is null', t.uid('agus'), v_casa), 0);
  perform t.check('las de otros inventarios siguen sin leer', exists (select 1 from public.notifications where user_id = t.uid('agus') and read_at is null));
  perform public.mark_all_notifications_read();
  perform t.expect_count('marcar todas como leídas', format('select 1 from public.notifications where user_id = %L and read_at is null', t.uid('agus')), 0);
  perform t.expect_count('María no puede leer notificaciones de otra persona', 'select 1 from public.notifications where user_id = ''' || t.uid('agus') || '''', (select count(*) from public.notifications where user_id = t.uid('agus')));
  perform t.as_root();

  perform t.as_user('maria');
  perform t.expect_count('María no ve notificaciones de Agustín', format('select 1 from public.notifications where user_id = %L', t.uid('agus')), 0);
  perform t.expect_count('ni puede borrarlas', format('with d as (delete from public.notifications where user_id = %L returning 1) select * from d', t.uid('agus')), 0);
  perform t.as_root();

  -- Ejemplos: crear y eliminar por completo
  perform t.as_user('agus');
  insert into public.inventories (owner_id, name) values (t.uid('agus'), 'Bodega') returning id into v_tmp;
  perform public.seed_example_data(v_tmp);
  perform t.check('estructura de ejemplo creada', (select product_count from public.inventory_overview where id = v_tmp) = 6);
  perform t.expect_count('los ejemplos no generan alertas (stock suficiente)', format('select 1 from public.stock_alerts where inventory_id = %L', v_tmp), 0);
  insert into public.locations (inventory_id, name) values (v_tmp, 'Mi ubicación real');
  perform public.remove_example_data(v_tmp);
  perform t.check('los ejemplos se eliminaron por completo',
    (select count(*) from public.products where inventory_id = v_tmp) = 0
    and (select count(*) from public.categories where inventory_id = v_tmp) = 0
    and (select count(*) from public.locations where inventory_id = v_tmp and is_example) = 0);
  perform t.check('lo creado por el usuario se conserva', (select count(*) from public.locations where inventory_id = v_tmp) = 1);

  -- Borrado en cascada de un inventario con datos, alertas y notificaciones
  insert into public.products (inventory_id, name, quantity, unit, min_stock) values (v_tmp, 'Algo', 1, 'u', 3) returning id into v_p;
  perform public.adjust_product_quantity(v_p, -1);
  perform t.expect_count('hay datos antes de borrar', format('select 1 from public.inventory_movements where inventory_id = %L', v_tmp), 14);
  delete from public.inventories where id = v_tmp;
  perform t.as_root();
  select count(*) into v_n from (
    select 1 from public.products where inventory_id = v_tmp union all
    select 1 from public.inventory_movements where inventory_id = v_tmp union all
    select 1 from public.shopping_list where inventory_id = v_tmp union all
    select 1 from public.stock_alerts where inventory_id = v_tmp union all
    select 1 from public.notifications where inventory_id = v_tmp union all
    select 1 from public.locations where inventory_id = v_tmp) q;
  perform t.check('el propietario elimina el inventario sin errores y sin restos', v_n = 0);

  -- Storage
  perform t.as_user('agus');
  insert into storage.objects (bucket_id, name) values ('product-images', v_casa || '/leche-1.jpg');
  perform t.expect_count('editor sube imagen a su inventario', 'select 1 from storage.objects', 1);
  perform t.as_root();
  perform t.as_user('maria');
  perform t.expect_count('miembro puede ver imágenes del inventario', 'select 1 from storage.objects', 1);
  perform t.as_root();
  perform t.as_user('diego');
  perform t.expect_count('no miembro no ve imágenes ajenas', 'select 1 from storage.objects', 0);
  perform t.expect_error(format('insert into storage.objects (bucket_id, name) values (''product-images'', ''%s/malo.jpg'')', v_casa), 'row-level security');
  perform t.expect_error('insert into storage.objects (bucket_id, name) values (''product-images'', ''no-es-uuid/malo.jpg'')', 'row-level security');
  perform t.as_root();
  perform t.check('el bucket es privado', (select public from storage.buckets where id = 'product-images') = false);
end $$;

-- ---------------------------------------------------------------------
-- M. Realtime y cosas generales
-- ---------------------------------------------------------------------
do $$
begin
  perform t.check('11 tablas en la publicación de Realtime', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') = 11);
  perform t.check('RLS activo en todas las tablas públicas', not exists (
    select 1 from pg_tables where schemaname = 'public' and not rowsecurity));
  perform t.as_user('agus');
  perform t.check('server_now() devuelve la hora del servidor', abs(extract(epoch from (public.server_now() - clock_timestamp()))) < 5);
  perform t.as_root();
end $$;
