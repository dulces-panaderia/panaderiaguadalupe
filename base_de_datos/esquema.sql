-- Ejecutar completo en Supabase > SQL Editor > New query > Run
-- REINICIO (solo si ya ejecutaste una versión anterior; BORRA los datos). Descomentá estas líneas:
-- drop trigger if exists al_crear_usuario on auth.users;
-- drop table if exists pagos, egresos, compra_items, compras, movimientos_stock, cajas, proveedores, venta_items, ventas, clientes, productos, categorias, perfiles cascade;
-- drop function if exists es_admin(), mi_rol(), nuevo_usuario(), registrar_venta(bigint,text,text,jsonb,jsonb), marcar_entregada(bigint), cancelar_venta(bigint), entregas(), proteger_codigo(),
--   mas_vendidos(int), panel_resumen(timestamptz,timestamptz), panel_serie(timestamptz,timestamptz,text,text), panel_productos(timestamptz,timestamptz), panel_calendario(timestamptz,timestamptz,text),
--   panel_medios(timestamptz,timestamptz), caja_abierta(), abrir_caja(numeric), resumen_caja(bigint), cerrar_caja(numeric,text), saldos_clientes(), cuenta_cliente(bigint),
--   registrar_cobro(bigint,numeric,text,text), registrar_compra(bigint,jsonb,jsonb,text), pagar_compra(bigint,numeric,text), registrar_egreso(text,text,text,numeric),
--   ajustar_stock(bigint,numeric,text,text), comprobante_venta(bigint), registrar_stock_inicial();
-- drop sequence if exists seq_productos, seq_categorias, seq_clientes, seq_ventas, seq_perfiles, seq_proveedores, seq_compras, seq_cajas, seq_pagos, seq_egresos, seq_movimientos;

create sequence seq_productos; create sequence seq_categorias; create sequence seq_clientes; create sequence seq_ventas; create sequence seq_perfiles;
grant usage, select on all sequences in schema public to authenticated, service_role;

create table perfiles(id uuid primary key references auth.users on delete cascade, codigo text not null unique default ('EMP-'||lpad(nextval('seq_perfiles')::text,3,'0')), nombre text, usuario text, correo text,
  rol text not null default 'pendiente' check (rol in ('admin','vendedor','repartidor','pendiente')),
  activo boolean not null default true);
create unique index perfiles_usuario_uk on perfiles(lower(usuario));
create table categorias(id bigint generated always as identity primary key, codigo text not null unique default ('CAT-'||lpad(nextval('seq_categorias')::text,3,'0')), nombre text not null, activo boolean not null default true);
create unique index categorias_nombre_uk on categorias(lower(nombre));
create table productos(id bigint generated always as identity primary key, codigo text not null unique default ('PRO-'||lpad(nextval('seq_productos')::text,4,'0')), nombre text not null, categoria_id bigint references categorias,
  unidad text not null default 'unidad' check (unidad in ('unidad','kg')),
  precio numeric(10,2) not null check (precio>=0), stock numeric(10,3) not null default 0 check (stock>=0),
  stock_minimo numeric(10,3) not null default 0, activo boolean not null default true);
create table clientes(id bigint generated always as identity primary key, codigo text not null unique default ('CLI-'||lpad(nextval('seq_clientes')::text,4,'0')), nombre text not null, telefono text, direccion text, activo boolean not null default true);
create table ventas(id bigint generated always as identity primary key, codigo text not null unique default ('VEN-'||lpad(nextval('seq_ventas')::text,6,'0')), cliente_id bigint references clientes on delete set null,
  vendedor_id uuid default auth.uid(), total numeric(10,2) not null,
  tipo_entrega text not null check (tipo_entrega in ('mostrador','delivery')), direccion text,
  estado text not null default 'completada' check (estado in ('completada','pendiente','entregada','cancelada')),
  created_at timestamptz not null default now());
create table venta_items(id bigint generated always as identity primary key, venta_id bigint not null references ventas on delete cascade,
  producto_id bigint not null references productos, cantidad numeric(10,3) not null check (cantidad>0),
  precio_unitario numeric(10,2) not null, subtotal numeric(10,2) not null);

create function mi_rol() returns text language sql stable security definer set search_path=public as
$$ select rol from perfiles where id=auth.uid() and activo $$;
create function es_admin() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(mi_rol()='admin',false) $$;

-- El primer usuario queda admin; los demás quedan "pendiente" (sin acceso) hasta que el admin les asigne un rol
create function nuevo_usuario() returns trigger language plpgsql security definer set search_path=public as
$$ begin insert into perfiles(id,nombre,usuario,rol) values(new.id, split_part(new.email,'@',1), lower(split_part(new.email,'@',1)),
  case when exists(select 1 from perfiles) then 'pendiente' else 'admin' end); return new; end $$;
create trigger al_crear_usuario after insert on auth.users for each row execute function nuevo_usuario();

alter table perfiles enable row level security; alter table productos enable row level security;
alter table clientes enable row level security; alter table ventas enable row level security;
alter table venta_items enable row level security; alter table categorias enable row level security;
create policy "ver" on perfiles for select to authenticated using (id=auth.uid() or es_admin());
create policy "admin" on perfiles for update to authenticated using (es_admin()) with check (es_admin());
create policy "ver" on productos for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "alta" on productos for insert to authenticated with check (es_admin());
create policy "mod" on productos for update to authenticated using (es_admin()) with check (es_admin());
create policy "ver" on categorias for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "alta" on categorias for insert to authenticated with check (es_admin());
create policy "mod" on categorias for update to authenticated using (es_admin()) with check (es_admin());
create policy "ver" on clientes for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "alta" on clientes for insert to authenticated with check (mi_rol() in ('admin','vendedor'));
create policy "mod" on clientes for update to authenticated using (es_admin());
-- Nada se elimina desde la aplicación: productos, clientes y empleados se desactivan.
create policy "ver" on ventas for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "ver" on venta_items for select to authenticated using (mi_rol() in ('admin','vendedor'));
-- ventas y venta_items NO tienen policies de escritura: solo se modifican con las funciones de abajo.
-- El repartidor no lee ninguna tabla: solo usa entregas() y marcar_entregada().

create function entregas() returns table(id bigint, codigo text, estado text, cliente text, telefono text, direccion text, total numeric, detalle text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, v.estado, c.nombre, c.telefono, coalesce(v.direccion,c.direccion), v.total,
    (select string_agg(p.nombre||' '||i.cantidad||case when p.unidad='kg' then ' kg' else ' u' end, ', ')
       from venta_items i join productos p on p.id=i.producto_id where i.venta_id=v.id), v.created_at
  from ventas v left join clientes c on c.id=v.cliente_id
  where mi_rol() in ('admin','repartidor') and v.tipo_entrega='delivery'
    and (v.estado='pendiente' or (v.estado='entregada' and v.created_at>now()-interval '1 day'))
  order by v.created_at $$;

create function marcar_entregada(p_id bigint) returns void language plpgsql security definer set search_path=public as
$$ begin
  if mi_rol() not in ('admin','repartidor') then raise exception 'No autorizado'; end if;
  update ventas set estado='entregada' where id=p_id and estado='pendiente' and tipo_entrega='delivery';
end $$;

create function mas_vendidos(p_limite int default 5) returns table(producto_id bigint, total numeric)
language sql stable security definer set search_path=public as $$
  select i.producto_id, sum(i.subtotal) as total
  from venta_items i join ventas v on v.id = i.venta_id
  where v.estado <> 'cancelada' and mi_rol() in ('admin','vendedor')
  group by i.producto_id order by sum(i.subtotal) desc limit p_limite $$;

create function panel_serie(p_desde timestamptz, p_hasta timestamptz, p_paso text, p_zona text)
returns table(periodo date, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select date_trunc(case when p_paso in ('day','week','month') then p_paso else 'day' end, v.created_at at time zone p_zona)::date,
         count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by 1 order by 1 $$;

create function panel_calendario(p_desde timestamptz, p_hasta timestamptz, p_zona text)
returns table(dow int, hora int, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select extract(dow from v.created_at at time zone p_zona)::int, extract(hour from v.created_at at time zone p_zona)::int, count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by 1, 2 $$;


-- Los códigos no se pueden modificar una vez asignados
create function proteger_codigo() returns trigger language plpgsql as
$$ begin if new.codigo is distinct from old.codigo then raise exception 'El código no se puede modificar'; end if; return new; end $$;
create trigger proteger_codigo before update on productos for each row execute function proteger_codigo();
create trigger proteger_codigo before update on categorias for each row execute function proteger_codigo();
create trigger proteger_codigo before update on clientes for each row execute function proteger_codigo();
create trigger proteger_codigo before update on ventas for each row execute function proteger_codigo();
create trigger proteger_codigo before update on perfiles for each row execute function proteger_codigo();

-- ======================= Caja, pagos, compras, costos e historial de stock =======================
-- ============ 1. Costos ============
alter table productos add column if not exists costo numeric(12,4) not null default 0 check (costo >= 0);
alter table venta_items add column if not exists costo_unitario numeric(12,4) not null default 0;   -- costo al momento de vender (las ventas anteriores quedan en 0 = costo desconocido)

-- El stock y el costo ya no se modifican directamente: solo con las funciones de más abajo (así queda registro de cada cambio)
revoke update on productos from authenticated, anon;
do $$ declare cols text; begin   -- se permite modificar todo salvo id, código y stock (las columnas se leen de la tabla real)
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name not in ('id', 'codigo', 'stock');
  execute 'grant update (' || cols || ') on productos to authenticated';
end $$;

-- ============ 2. Tablas nuevas (cada registro tiene un código permanente) ============
create sequence if not exists seq_proveedores; create sequence if not exists seq_compras; create sequence if not exists seq_cajas;
create sequence if not exists seq_pagos; create sequence if not exists seq_egresos; create sequence if not exists seq_movimientos;
grant usage, select on all sequences in schema public to authenticated, service_role;

create table proveedores(id bigint generated always as identity primary key,
  codigo text not null unique default ('PRV-' || lpad(nextval('seq_proveedores')::text, 3, '0')),
  nombre text not null, telefono text, correo text, direccion text, notas text,
  activo boolean not null default true, created_at timestamptz not null default now());
create unique index proveedores_nombre_uk on proveedores(lower(nombre));

create table cajas(id bigint generated always as identity primary key,
  codigo text not null unique default ('CAJ-' || lpad(nextval('seq_cajas')::text, 4, '0')),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  monto_inicial numeric(12,2) not null check (monto_inicial >= 0),
  abierta_por uuid default auth.uid(), abierta_en timestamptz not null default now(),
  cerrada_por uuid, cerrada_en timestamptz,
  efectivo_esperado numeric(12,2), efectivo_contado numeric(12,2), diferencia numeric(12,2), observaciones text);
create unique index cajas_una_abierta on cajas((true)) where estado = 'abierta';   -- solo puede haber una caja abierta

create table compras(id bigint generated always as identity primary key,
  codigo text not null unique default ('CMP-' || lpad(nextval('seq_compras')::text, 6, '0')),
  proveedor_id bigint not null references proveedores, total numeric(12,2) not null, nota text,
  usuario_id uuid default auth.uid(), created_at timestamptz not null default now());
create table compra_items(id bigint generated always as identity primary key,
  compra_id bigint not null references compras on delete cascade, producto_id bigint not null references productos,
  cantidad numeric(12,3) not null check (cantidad > 0), costo_unitario numeric(12,4) not null check (costo_unitario >= 0), subtotal numeric(12,2) not null);

create table egresos(id bigint generated always as identity primary key,
  codigo text not null unique default ('EGR-' || lpad(nextval('seq_egresos')::text, 6, '0')),
  caja_id bigint references cajas, tipo text not null check (tipo in ('compra','gasto','retiro')), concepto text,
  proveedor_id bigint references proveedores, compra_id bigint references compras,
  medio text not null check (medio in ('efectivo','transferencia','tarjeta')), monto numeric(12,2) not null check (monto > 0),
  usuario_id uuid default auth.uid(), created_at timestamptz not null default now());

-- Cada cobro de una venta, cobro de deuda o devolución. El medio "deuda" es lo que el cliente queda debiendo (solo clientes registrados).
create table pagos(id bigint generated always as identity primary key,
  codigo text not null unique default ('PAG-' || lpad(nextval('seq_pagos')::text, 6, '0')),
  caja_id bigint not null references cajas, venta_id bigint references ventas, cliente_id bigint references clientes,
  tipo text not null check (tipo in ('venta','cobro_deuda','devolucion')),
  medio text not null check (medio in ('efectivo','transferencia','tarjeta','deuda')),
  monto numeric(12,2) not null, nota text, usuario_id uuid default auth.uid(), created_at timestamptz not null default now(),
  constraint pagos_deuda_con_cliente check (medio <> 'deuda' or cliente_id is not null),
  constraint pagos_cobro_valido check (tipo <> 'cobro_deuda' or (medio <> 'deuda' and cliente_id is not null and monto > 0)));
create index pagos_caja_ix on pagos(caja_id); create index pagos_cliente_ix on pagos(cliente_id); create index pagos_venta_ix on pagos(venta_id);

create table movimientos_stock(id bigint generated always as identity primary key,
  codigo text not null unique default ('MOV-' || lpad(nextval('seq_movimientos')::text, 6, '0')),
  producto_id bigint not null references productos,
  tipo text not null check (tipo in ('inicial','compra','venta','anulacion','ajuste','merma')),
  cantidad numeric(12,3) not null, stock_resultante numeric(12,3) not null, motivo text,
  venta_id bigint references ventas, compra_id bigint references compras,
  usuario_id uuid default auth.uid(), created_at timestamptz not null default now());
create index movimientos_producto_ix on movimientos_stock(producto_id, created_at desc);

create trigger proteger_codigo before update on proveedores for each row execute function proteger_codigo();
create trigger proteger_codigo before update on cajas for each row execute function proteger_codigo();
create trigger proteger_codigo before update on compras for each row execute function proteger_codigo();
create trigger proteger_codigo before update on egresos for each row execute function proteger_codigo();
create trigger proteger_codigo before update on pagos for each row execute function proteger_codigo();
create trigger proteger_codigo before update on movimientos_stock for each row execute function proteger_codigo();

-- Seguridad: solo se leen estas tablas; se escriben únicamente con las funciones (excepto proveedores, que administra el admin)
alter table proveedores enable row level security; alter table cajas enable row level security; alter table compras enable row level security;
alter table compra_items enable row level security; alter table egresos enable row level security; alter table pagos enable row level security;
alter table movimientos_stock enable row level security;
create policy "ver" on proveedores for select to authenticated using (es_admin());
create policy "alta" on proveedores for insert to authenticated with check (es_admin());
create policy "mod" on proveedores for update to authenticated using (es_admin()) with check (es_admin());
create policy "ver" on cajas for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "ver" on pagos for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "ver" on compras for select to authenticated using (es_admin());
create policy "ver" on compra_items for select to authenticated using (es_admin());
create policy "ver" on egresos for select to authenticated using (es_admin());
create policy "ver" on movimientos_stock for select to authenticated using (es_admin());

-- Los productos nuevos con stock inicial también quedan en el historial
create function registrar_stock_inicial() returns trigger language plpgsql security definer set search_path=public as
$$ begin
  if new.stock > 0 then
    insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo) values (new.id, 'inicial', new.stock, new.stock, 'Stock inicial');
  end if;
  return new;
end $$;
create trigger stock_inicial after insert on productos for each row execute function registrar_stock_inicial();
-- Stock que ya existía al activar el historial
insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo)
  select id, 'inicial', stock, stock, 'Saldo al activar el historial' from productos where stock > 0;

-- ============ 3. Caja ============
create function caja_abierta() returns bigint language sql stable security definer set search_path=public as
$$ select id from cajas where estado = 'abierta' limit 1 $$;

create function abrir_caja(p_monto_inicial numeric) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if p_monto_inicial is null or p_monto_inicial < 0 then raise exception 'El monto inicial no es válido'; end if;
  insert into cajas(monto_inicial) values (round(p_monto_inicial, 2)) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una caja abierta';
end $$;

-- Resumen de una caja: ventas, cobros de deuda, devoluciones y egresos por medio de pago, y el efectivo que debería haber
create function resumen_caja(p_caja bigint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c cajas;
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  select * into c from cajas where id = p_caja;
  if not found then raise exception 'Caja inexistente'; end if;
  return jsonb_build_object(
    'caja', to_jsonb(c),
    'ventas', coalesce((select jsonb_object_agg(medio, t) from (select medio, sum(monto) t from pagos where caja_id = p_caja and tipo = 'venta' group by medio) x), '{}'::jsonb),
    'cobros', coalesce((select jsonb_object_agg(medio, t) from (select medio, sum(monto) t from pagos where caja_id = p_caja and tipo = 'cobro_deuda' group by medio) x), '{}'::jsonb),
    'devoluciones', coalesce((select jsonb_object_agg(medio, t) from (select medio, sum(monto) t from pagos where caja_id = p_caja and tipo = 'devolucion' group by medio) x), '{}'::jsonb),
    'egresos', coalesce((select jsonb_object_agg(medio, t) from (select medio, sum(monto) t from egresos where caja_id = p_caja group by medio) x), '{}'::jsonb),
    'cantidad_ventas', (select count(distinct venta_id) from pagos where caja_id = p_caja and tipo = 'venta'),
    'efectivo_esperado', c.monto_inicial + coalesce((select sum(monto) from pagos where caja_id = p_caja and medio = 'efectivo'), 0)
                         - coalesce((select sum(monto) from egresos where caja_id = p_caja and medio = 'efectivo'), 0));
end $$;

create function cerrar_caja(p_contado numeric, p_observaciones text default null) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint := caja_abierta(); v_esperado numeric;
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if v_id is null then raise exception 'No hay una caja abierta'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'El efectivo contado no es válido'; end if;
  v_esperado := (resumen_caja(v_id) ->> 'efectivo_esperado')::numeric;
  update cajas set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), efectivo_esperado = v_esperado,
    efectivo_contado = round(p_contado, 2), diferencia = round(p_contado, 2) - v_esperado, observaciones = nullif(trim(p_observaciones), '')
  where id = v_id;
  return v_id;
end $$;

-- ============ 4. Ventas con pagos mixtos y deuda ============
create function registrar_venta(p_cliente bigint, p_tipo text, p_direccion text, p_items jsonb, p_pagos jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_caja bigint; it jsonb; pg jsonb; pr productos; q numeric; sub numeric; tot numeric := 0; pagado numeric := 0; m numeric; v_medio text;
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  v_caja := caja_abierta();
  if v_caja is null then raise exception 'No hay una caja abierta. Abrila en la pestaña Caja para registrar ventas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
  if p_cliente is not null and not exists (select 1 from clientes where id = p_cliente and activo) then raise exception 'El cliente no existe o está desactivado'; end if;
  insert into ventas(cliente_id, total, tipo_entrega, direccion, estado)
    values (p_cliente, 0, p_tipo, p_direccion, case when p_tipo = 'delivery' then 'pendiente' else 'completada' end) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it ->> 'cantidad')::numeric;
    select * into pr from productos where id = (it ->> 'producto_id')::bigint and activo for update;
    if not found then raise exception 'Producto no disponible'; end if;
    if q <= 0 or q > pr.stock then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, trim_scale(pr.stock); end if;
    sub := round(q * pr.precio, 2);
    insert into venta_items(venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal) values (v_id, pr.id, q, pr.precio, pr.costo, sub);
    update productos set stock = stock - q where id = pr.id;
    insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo, venta_id) values (pr.id, 'venta', -q, pr.stock - q, 'Venta', v_id);
    tot := tot + sub;
  end loop;
  update ventas set total = tot where id = v_id;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then raise exception 'Indicá cómo se paga la venta'; end if;
  for pg in select * from jsonb_array_elements(p_pagos) loop
    v_medio := pg ->> 'medio'; m := round((pg ->> 'monto')::numeric, 2);
    if v_medio is null or v_medio not in ('efectivo','transferencia','tarjeta','deuda') then raise exception 'Medio de pago inválido'; end if;
    if m < 0 then raise exception 'Los montos no pueden ser negativos'; end if;
    if m = 0 then continue; end if;
    if v_medio = 'deuda' and p_cliente is null then raise exception 'La deuda solo se permite a clientes registrados'; end if;
    insert into pagos(caja_id, venta_id, cliente_id, tipo, medio, monto) values (v_caja, v_id, p_cliente, 'venta', v_medio, m);
    pagado := pagado + m;
  end loop;
  if abs(pagado - tot) > 0.005 then raise exception 'Los pagos ($%) no coinciden con el total ($%)', pagado, tot; end if;
  return v_id;
end $$;

-- Cancelar una venta devuelve el stock y el dinero (contraasientos en la caja abierta) y anula la deuda si la había
create function cancelar_venta(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare v ventas; i record; g record; v_caja bigint; v_stock numeric;
begin
  if not es_admin() then raise exception 'Solo el admin puede cancelar'; end if;
  select * into v from ventas where id = p_id for update;
  if not found or v.estado = 'cancelada' then raise exception 'Venta inexistente o ya cancelada'; end if;
  v_caja := caja_abierta();
  if v_caja is null and exists (select 1 from pagos where venta_id = p_id and tipo = 'venta' and medio <> 'deuda') then
    raise exception 'Abrí la caja para registrar la devolución del dinero';
  end if;
  for i in select * from venta_items where venta_id = p_id loop
    update productos set stock = stock + i.cantidad where id = i.producto_id returning stock into v_stock;
    insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo, venta_id) values (i.producto_id, 'anulacion', i.cantidad, v_stock, 'Venta cancelada', p_id);
  end loop;
  for g in select medio, sum(monto) as m from pagos where venta_id = p_id and tipo = 'venta' group by medio loop
    insert into pagos(caja_id, venta_id, cliente_id, tipo, medio, monto, nota)
      values (coalesce(v_caja, (select caja_id from pagos where venta_id = p_id order by id limit 1)), p_id, v.cliente_id, 'devolucion', g.medio, -g.m, 'Venta cancelada');
  end loop;
  update ventas set estado = 'cancelada' where id = p_id;
end $$;

-- ============ 5. Cuenta corriente de clientes (deuda) ============
create function saldos_clientes() returns table(cliente_id bigint, saldo numeric) language sql stable security definer set search_path=public as $$
  select p.cliente_id, sum(case when p.medio = 'deuda' then p.monto else -p.monto end)
  from pagos p where mi_rol() in ('admin','vendedor') and p.cliente_id is not null and (p.medio = 'deuda' or p.tipo = 'cobro_deuda')
  group by p.cliente_id $$;

create function cuenta_cliente(p_cliente bigint) returns table(fecha timestamptz, tipo text, detalle text, monto numeric) language sql stable security definer set search_path=public as $$
  select p.created_at, case when p.tipo = 'cobro_deuda' then 'cobro' when p.tipo = 'devolucion' then 'anulación' else 'deuda' end,
         coalesce(v.codigo, 'Cobro') || case when p.tipo = 'cobro_deuda' then ' (' || p.medio || ')' else '' end,
         case when p.tipo = 'cobro_deuda' then -p.monto else p.monto end
  from pagos p left join ventas v on v.id = p.venta_id
  where mi_rol() in ('admin','vendedor') and p.cliente_id = p_cliente and (p.medio = 'deuda' or p.tipo = 'cobro_deuda')
  order by p.created_at, p.id $$;

create function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text, p_nota text default null) returns bigint language plpgsql security definer set search_path=public as $$
declare v_caja bigint := caja_abierta(); v_saldo numeric; v_id bigint; m numeric := round(p_monto, 2);
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if v_caja is null then raise exception 'No hay una caja abierta. Abrila en la pestaña Caja para registrar cobros'; end if;
  if p_medio is null or p_medio not in ('efectivo','transferencia','tarjeta') then raise exception 'Medio de pago inválido'; end if;
  if m is null or m <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if not exists (select 1 from clientes where id = p_cliente) then raise exception 'Cliente inexistente'; end if;
  select coalesce(sum(case when medio = 'deuda' then monto else -monto end), 0) into v_saldo from pagos where cliente_id = p_cliente and (medio = 'deuda' or tipo = 'cobro_deuda');
  if m > v_saldo + 0.005 then raise exception 'El monto supera la deuda del cliente ($%)', v_saldo; end if;
  insert into pagos(caja_id, cliente_id, tipo, medio, monto, nota) values (v_caja, p_cliente, 'cobro_deuda', p_medio, m, nullif(trim(p_nota), '')) returning id into v_id;
  return v_id;
end $$;

-- ============ 6. Compras a proveedores (actualizan stock y costo promedio) ============
create function registrar_compra(p_proveedor bigint, p_items jsonb, p_pagos jsonb, p_nota text default null) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_caja bigint := caja_abierta(); it jsonb; pg jsonb; pr productos; q numeric; c numeric; sub numeric; tot numeric := 0; pagado numeric := 0; m numeric; v_medio text; nuevo numeric;
begin
  if not es_admin() then raise exception 'Solo el administrador puede registrar compras'; end if;
  if not exists (select 1 from proveedores where id = p_proveedor and activo) then raise exception 'El proveedor no existe o está desactivado'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Agregá al menos un producto'; end if;
  insert into compras(proveedor_id, total, nota) values (p_proveedor, 0, nullif(trim(p_nota), '')) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it ->> 'cantidad')::numeric; c := (it ->> 'costo_unitario')::numeric;
    if q is null or c is null or q <= 0 or c < 0 then raise exception 'Cantidad o costo inválido'; end if;
    select * into pr from productos where id = (it ->> 'producto_id')::bigint for update;
    if not found then raise exception 'Producto inexistente'; end if;
    nuevo := case when pr.stock + q > 0 then round((pr.stock * pr.costo + q * c) / (pr.stock + q), 4) else c end;   -- costo promedio ponderado
    sub := round(q * c, 2);
    insert into compra_items(compra_id, producto_id, cantidad, costo_unitario, subtotal) values (v_id, pr.id, q, c, sub);
    update productos set stock = stock + q, costo = nuevo where id = pr.id;
    insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo, compra_id) values (pr.id, 'compra', q, pr.stock + q, 'Compra', v_id);
    tot := tot + sub;
  end loop;
  update compras set total = tot where id = v_id;
  for pg in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop     -- lo que no se paga ahora queda como deuda con el proveedor
    v_medio := pg ->> 'medio'; m := round((pg ->> 'monto')::numeric, 2);
    if v_medio is null or v_medio not in ('efectivo','transferencia','tarjeta') then raise exception 'Medio de pago inválido'; end if;
    if m < 0 then raise exception 'Los montos no pueden ser negativos'; end if;
    if m = 0 then continue; end if;
    if v_medio = 'efectivo' and v_caja is null then raise exception 'Abrí la caja para pagar en efectivo'; end if;
    insert into egresos(caja_id, tipo, concepto, proveedor_id, compra_id, medio, monto) values (v_caja, 'compra', 'Pago de compra', p_proveedor, v_id, v_medio, m);
    pagado := pagado + m;
  end loop;
  if pagado > tot + 0.005 then raise exception 'Los pagos superan el total de la compra'; end if;
  return v_id;
end $$;

create function pagar_compra(p_compra bigint, p_monto numeric, p_medio text) returns bigint language plpgsql security definer set search_path=public as $$
declare c compras; v_caja bigint := caja_abierta(); v_saldo numeric; v_id bigint; m numeric := round(p_monto, 2);
begin
  if not es_admin() then raise exception 'Solo el administrador puede registrar pagos a proveedores'; end if;
  select * into c from compras where id = p_compra; if not found then raise exception 'Compra inexistente'; end if;
  if p_medio is null or p_medio not in ('efectivo','transferencia','tarjeta') then raise exception 'Medio de pago inválido'; end if;
  if m is null or m <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_medio = 'efectivo' and v_caja is null then raise exception 'Abrí la caja para pagar en efectivo'; end if;
  v_saldo := c.total - coalesce((select sum(monto) from egresos where compra_id = p_compra), 0);
  if m > v_saldo + 0.005 then raise exception 'El monto supera lo que se debe de esta compra ($%)', v_saldo; end if;
  insert into egresos(caja_id, tipo, concepto, proveedor_id, compra_id, medio, monto) values (v_caja, 'compra', 'Pago de compra', c.proveedor_id, p_compra, p_medio, m) returning id into v_id;
  return v_id;
end $$;

create function registrar_egreso(p_tipo text, p_concepto text, p_medio text, p_monto numeric) returns bigint language plpgsql security definer set search_path=public as $$
declare v_caja bigint := caja_abierta(); v_id bigint; m numeric := round(p_monto, 2);
begin
  if not es_admin() then raise exception 'Solo el administrador puede registrar egresos'; end if;
  if p_tipo is null or p_tipo not in ('gasto','retiro') then raise exception 'Tipo de egreso inválido'; end if;
  if p_concepto is null or trim(p_concepto) = '' then raise exception 'Escribí el concepto del egreso'; end if;
  if p_medio is null or p_medio not in ('efectivo','transferencia','tarjeta') then raise exception 'Medio de pago inválido'; end if;
  if m is null or m <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_medio = 'efectivo' and v_caja is null then raise exception 'Abrí la caja para registrar un egreso en efectivo'; end if;
  insert into egresos(caja_id, tipo, concepto, medio, monto) values (v_caja, p_tipo, trim(p_concepto), p_medio, m) returning id into v_id;
  return v_id;
end $$;

-- ============ 7. Ajustes de stock con historial ============
create function ajustar_stock(p_producto bigint, p_delta numeric, p_tipo text, p_motivo text) returns void language plpgsql security definer set search_path=public as $$
declare v_stock numeric;
begin
  if not es_admin() then raise exception 'Solo el administrador puede ajustar el stock'; end if;
  if p_tipo is null or p_tipo not in ('ajuste','merma') then raise exception 'Tipo de ajuste inválido'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'La cantidad no puede ser cero'; end if;
  if p_tipo = 'merma' and p_delta > 0 then raise exception 'Una merma debe restar stock'; end if;
  if p_motivo is null or trim(p_motivo) = '' then raise exception 'Escribí el motivo del ajuste'; end if;
  select stock into v_stock from productos where id = p_producto for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if v_stock + p_delta < 0 then raise exception 'El stock no puede quedar negativo (hay %)', trim_scale(v_stock); end if;
  update productos set stock = v_stock + p_delta where id = p_producto;
  v_stock := v_stock + p_delta;
  insert into movimientos_stock(producto_id, tipo, cantidad, stock_resultante, motivo) values (p_producto, p_tipo, p_delta, v_stock, trim(p_motivo));
end $$;

-- ============ 8. Comprobante imprimible (no fiscal) ============
create function comprobante_venta(p_id bigint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v ventas;
begin
  if mi_rol() not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id;
  if not found then raise exception 'Venta inexistente'; end if;
  return jsonb_build_object('codigo', v.codigo, 'fecha', v.created_at, 'estado', v.estado, 'total', v.total, 'tipo_entrega', v.tipo_entrega, 'direccion', v.direccion,
    'vendedor', (select nombre from perfiles where id = v.vendedor_id),
    'cliente', (select jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'telefono', c.telefono) from clientes c where c.id = v.cliente_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'unidad', p.unidad, 'cantidad', i.cantidad, 'precio', i.precio_unitario, 'subtotal', i.subtotal) order by i.id)
                       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('medio', g.medio, 'monto', g.monto) order by g.id) from pagos g where g.venta_id = v.id and g.tipo = 'venta'), '[]'::jsonb),
    'saldo_cliente', (select coalesce(sum(case when g.medio = 'deuda' then g.monto else -g.monto end), 0) from pagos g
                      where v.cliente_id is not null and g.cliente_id = v.cliente_id and (g.medio = 'deuda' or g.tipo = 'cobro_deuda')));
end $$;

-- ============ 9. Panel: ganancias, gastos y medios de pago ============
create function panel_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table(cantidad bigint, importe numeric, cantidad_delivery bigint, importe_delivery numeric, canceladas bigint, costo numeric, gastos numeric)
language sql stable security definer set search_path=public as $$
  select count(*) filter (where v.estado <> 'cancelada'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada'), 0),
         count(*) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'), 0),
         count(*) filter (where v.estado = 'cancelada'),
         coalesce((select sum(i.cantidad * i.costo_unitario) from venta_items i join ventas w on w.id = i.venta_id
                   where es_admin() and w.estado <> 'cancelada' and w.created_at >= p_desde and w.created_at < p_hasta), 0),
         coalesce((select sum(e.monto) from egresos e where es_admin() and e.tipo = 'gasto' and e.created_at >= p_desde and e.created_at < p_hasta), 0)
  from ventas v where es_admin() and v.created_at >= p_desde and v.created_at < p_hasta $$;

create function panel_productos(p_desde timestamptz, p_hasta timestamptz)
returns table(producto_id bigint, codigo text, nombre text, categoria text, unidad text, cantidad numeric, importe numeric, costo numeric)
language sql stable security definer set search_path=public as $$
  select p.id, p.codigo, p.nombre, coalesce(c.nombre, 'Sin categoría'), p.unidad, sum(i.cantidad), sum(i.subtotal), sum(i.cantidad * i.costo_unitario)
  from venta_items i join ventas v on v.id = i.venta_id join productos p on p.id = i.producto_id left join categorias c on c.id = p.categoria_id
  where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by p.id, p.codigo, p.nombre, c.nombre, p.unidad
  order by sum(i.subtotal) desc $$;

create function panel_medios(p_desde timestamptz, p_hasta timestamptz) returns table(medio text, importe numeric) language sql stable security definer set search_path=public as $$
  select g.medio, sum(g.monto) from pagos g join ventas v on v.id = g.venta_id
  where es_admin() and g.tipo = 'venta' and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by g.medio order by sum(g.monto) desc $$;

-- ============ 10. Permisos de las funciones ============
revoke execute on function caja_abierta(), abrir_caja(numeric), resumen_caja(bigint), cerrar_caja(numeric, text), registrar_venta(bigint, text, text, jsonb, jsonb),
  cancelar_venta(bigint), saldos_clientes(), cuenta_cliente(bigint), registrar_cobro(bigint, numeric, text, text), registrar_compra(bigint, jsonb, jsonb, text),
  pagar_compra(bigint, numeric, text), registrar_egreso(text, text, text, numeric), ajustar_stock(bigint, numeric, text, text), comprobante_venta(bigint),
  panel_resumen(timestamptz, timestamptz), panel_productos(timestamptz, timestamptz), panel_medios(timestamptz, timestamptz), registrar_stock_inicial() from public, anon;
grant execute on function caja_abierta(), abrir_caja(numeric), resumen_caja(bigint), cerrar_caja(numeric, text), registrar_venta(bigint, text, text, jsonb, jsonb),
  cancelar_venta(bigint), saldos_clientes(), cuenta_cliente(bigint), registrar_cobro(bigint, numeric, text, text), registrar_compra(bigint, jsonb, jsonb, text),
  pagar_compra(bigint, numeric, text), registrar_egreso(text, text, text, numeric), ajustar_stock(bigint, numeric, text, text), comprobante_venta(bigint),
  panel_resumen(timestamptz, timestamptz), panel_productos(timestamptz, timestamptz), panel_medios(timestamptz, timestamptz) to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function mi_rol, es_admin, registrar_venta, entregas, marcar_entregada, cancelar_venta, mas_vendidos, panel_resumen, panel_serie, panel_productos, panel_calendario to authenticated;

-- Si ya tenías cuentas creadas: la más antigua queda admin y las demás pendientes
insert into perfiles(id,nombre,usuario,rol)
  select id, split_part(email,'@',1), lower(split_part(email,'@',1)), case when row_number() over(order by created_at)=1 then 'admin' else 'pendiente' end
  from auth.users on conflict do nothing;
