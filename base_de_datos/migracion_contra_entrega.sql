-- Migración 11: cobro contra entrega. Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Requiere haber ejecutado antes la migración 9 (delivery). Se puede ejecutar más de una vez sin problema y NO borra datos.
-- (Reemplaza a la versión anterior de esta migración, "cobro del envío": si ya la ejecutaste no hace falta deshacer nada, esta la deja sin efecto.)
--
-- En una venta con delivery se puede elegir "contra entrega": el cliente le paga el total en efectivo al delivery cuando recibe el pedido.
--   * La venta se registra igual (se descuenta el stock) pero NO se cobra ni cuenta como venta todavía.
--   * El delivery la marca "cobrada": ahí se registra el pago en efectivo en la caja abierta y recién ahí suma a las ventas y al Panel.
--   * Mientras no esté cobrada, el delivery ve "cobrar $X" en su pedido; en una venta ya paga ve "pagado".

-- ============ 1. Columnas nuevas en ventas ============
alter table ventas add column if not exists contra_entrega boolean not null default false;   -- el delivery cobra el total al entregar
alter table ventas add column if not exists cobrada_en timestamptz;                           -- cuándo el delivery la marcó cobrada
alter table ventas add column if not exists cobrada_por uuid;                                 -- quién la marcó cobrada
do $$ begin   -- contada_en: la fecha en que la venta cuenta para las ventas y el Panel (una venta normal: cuando se hace; contra entrega: cuando se cobra)
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ventas' and column_name = 'contada_en') then
    alter table ventas add column contada_en timestamptz;
    update ventas set contada_en = created_at;
    alter table ventas alter column contada_en set default now();
  end if;
end $$;
alter table ventas drop constraint if exists ventas_contra_entrega_valida;
alter table ventas add constraint ventas_contra_entrega_valida check (not contra_entrega or tipo_entrega = 'delivery');
create index if not exists ventas_por_cobrar_ix on ventas(repartidor_id) where contra_entrega and cobrada_en is null;

-- ============ 2. Venta: puede ser contra entrega ============
drop function if exists registrar_venta(bigint, text, text, jsonb, jsonb);
drop function if exists registrar_venta(bigint, text, text, jsonb, jsonb, numeric);
drop function if exists registrar_venta(bigint, text, text, jsonb, jsonb, numeric, text);
create function registrar_venta(p_cliente bigint, p_tipo text, p_direccion text, p_items jsonb, p_pagos jsonb, p_costo_envio numeric default 0, p_contra_entrega boolean default false) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_caja bigint; it jsonb; pg jsonb; pr productos; q numeric; sub numeric; tot numeric := 0; pagado numeric := 0; m numeric; v_medio text; v_envio numeric := round(coalesce(p_costo_envio, 0), 2); v_contra boolean := coalesce(p_contra_entrega, false);
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if p_tipo is null or p_tipo not in ('mostrador','delivery') then raise exception 'Tipo de entrega inválido'; end if;
  if p_tipo = 'delivery' and nullif(trim(coalesce(p_direccion, '')), '') is null then raise exception 'Ingresá la dirección de entrega'; end if;
  if v_envio < 0 then raise exception 'El costo de envío no puede ser negativo'; end if;
  if v_envio > 0 and p_tipo <> 'delivery' then raise exception 'El costo de envío solo corresponde a un delivery'; end if;
  if v_contra and p_tipo <> 'delivery' then raise exception 'El cobro contra entrega solo corresponde a un delivery'; end if;
  if v_contra and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_pagos) = 'array' then p_pagos else '[]'::jsonb end) x where coalesce((x ->> 'monto')::numeric, 0) > 0)
    then raise exception 'Una venta contra entrega no se cobra ahora: la cobra el delivery al entregar'; end if;
  v_caja := caja_abierta();
  if v_caja is null then raise exception 'No hay una caja abierta. Abrila en la pestaña Caja para registrar ventas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
  if p_cliente is not null and not exists (select 1 from clientes where id = p_cliente and activo) then raise exception 'El cliente no existe o está desactivado'; end if;
  insert into ventas(cliente_id, total, tipo_entrega, direccion, estado, contra_entrega, contada_en)   -- contada_en vacío = todavía no cuenta como venta cobrada
    values (p_cliente, 0, p_tipo, nullif(trim(p_direccion), ''), case when p_tipo = 'delivery' then 'pendiente' else 'completada' end, v_contra, case when v_contra then null else now() end) returning id into v_id;
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
  tot := tot + v_envio;   -- el total a cobrar incluye el envío (así los pagos, la caja y la deuda siguen sumando lo mismo)
  update ventas set total = tot, costo_envio = v_envio where id = v_id;
  if not v_contra and (p_pagos is null or jsonb_typeof(p_pagos) <> 'array') then raise exception 'Indicá cómo se paga la venta'; end if;
  for pg in select * from jsonb_array_elements(case when v_contra then '[]'::jsonb else p_pagos end) loop
    v_medio := pg ->> 'medio'; m := round((pg ->> 'monto')::numeric, 2);
    if v_medio is null or v_medio not in ('efectivo','transferencia','tarjeta','deuda') then raise exception 'Medio de pago inválido'; end if;
    if m < 0 then raise exception 'Los montos no pueden ser negativos'; end if;
    if m = 0 then continue; end if;
    if v_medio = 'deuda' and p_cliente is null then raise exception 'La deuda solo se permite a clientes registrados'; end if;
    insert into pagos(caja_id, venta_id, cliente_id, tipo, medio, monto) values (v_caja, v_id, p_cliente, 'venta', v_medio, m);
    pagado := pagado + m;
  end loop;
  if not v_contra and abs(pagado - tot) > 0.005 then raise exception 'Los pagos ($%) no coinciden con el total ($%)', pagado, tot; end if;
  return v_id;
end $$;

-- ============ 3. Comprobante: incluye si es contra entrega y si ya se cobró ============
create or replace function comprobante_venta(p_id bigint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v ventas;
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id;
  if not found then raise exception 'Venta inexistente'; end if;
  return jsonb_build_object('codigo', v.codigo, 'fecha', v.created_at, 'estado', v.estado, 'total', v.total, 'costo_envio', v.costo_envio, 'contra_entrega', v.contra_entrega, 'cobrada_en', v.cobrada_en, 'tipo_entrega', v.tipo_entrega, 'direccion', v.direccion,
    'repartidor', (select nombre from perfiles where id = v.repartidor_id), 'entregada_en', v.entregada_en,
    'vendedor', (select nombre from perfiles where id = v.vendedor_id),
    'cliente', (select jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'telefono', c.telefono) from clientes c where c.id = v.cliente_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'unidad', p.unidad, 'cantidad', i.cantidad, 'precio', i.precio_unitario, 'subtotal', i.subtotal) order by i.id)
                       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('medio', g.medio, 'monto', g.monto) order by g.id) from pagos g where g.venta_id = v.id and g.tipo = 'venta'), '[]'::jsonb),
    'saldo_cliente', (select coalesce(sum(case when g.medio = 'deuda' then g.monto else -g.monto end), 0) from pagos g
                      where v.cliente_id is not null and g.cliente_id = v.cliente_id and (g.medio = 'deuda' or g.tipo = 'cobro_deuda')));
end $$;

-- ============ 4. Marcar entregada (con o sin cobro) ============
-- p_cobrada = true: en un pedido contra entrega registra también el cobro en efectivo. Si no hay caja abierta, avisa (se puede entregar sin cobrar y cobrar después).
drop function if exists marcar_entregada(bigint);
create function marcar_entregada(p_id bigint, p_cobrada boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare v ventas; v_rol text := mi_rol(); v_caja bigint; v_cobrar boolean;
begin
  if coalesce(v_rol, '') not in ('admin','repartidor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id and tipo_entrega = 'delivery' for update;
  if not found then raise exception 'Pedido de delivery inexistente'; end if;
  if v.estado not in ('pendiente','en_camino') then raise exception 'El pedido no se puede marcar como entregado (estado: %)', v.estado; end if;
  if v_rol = 'repartidor' and v.repartidor_id is not null and v.repartidor_id <> auth.uid() then raise exception 'El pedido está asignado a otro repartidor'; end if;
  v_cobrar := v.contra_entrega and coalesce(p_cobrada, false) and v.cobrada_en is null;
  if v_cobrar then
    v_caja := caja_abierta();
    if v_caja is null then raise exception 'No hay una caja abierta: el local tiene que abrirla para registrar el cobro. Podés marcar el pedido entregado sin cobrar y cobrarlo después'; end if;
    insert into pagos(caja_id, venta_id, cliente_id, tipo, medio, monto) values (v_caja, v.id, v.cliente_id, 'venta', 'efectivo', v.total);
  end if;
  update ventas set estado = 'entregada', entregada_en = now(), entregada_por = auth.uid(),
    repartidor_id = case when v_rol = 'repartidor' then auth.uid() else v.repartidor_id end,
    cobrada_en = case when v_cobrar then now() else v.cobrada_en end,
    cobrada_por = case when v_cobrar then auth.uid() else v.cobrada_por end,
    contada_en = case when v_cobrar then now() else v.contada_en end   -- desde acá suma a las ventas
  where id = p_id;
end $$;

-- ============ 5. Marcar cobrada: el cobro en efectivo de un pedido contra entrega ============
create function marcar_cobrada(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare v ventas; v_rol text := mi_rol(); v_caja bigint;
begin
  if coalesce(v_rol, '') not in ('admin','repartidor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id and tipo_entrega = 'delivery' and contra_entrega for update;
  if not found then raise exception 'El pedido no existe o no es contra entrega'; end if;
  if v.cobrada_en is not null then raise exception 'El pedido ya está cobrado'; end if;
  if v.estado not in ('en_camino','entregada') then raise exception 'Solo se puede cobrar un pedido en camino o ya entregado (estado: %)', v.estado; end if;
  if v_rol = 'repartidor' and v.repartidor_id is distinct from auth.uid() then raise exception 'El pedido no es tuyo'; end if;
  v_caja := caja_abierta();
  if v_caja is null then raise exception 'No hay una caja abierta: el local tiene que abrirla para registrar el cobro'; end if;
  insert into pagos(caja_id, venta_id, cliente_id, tipo, medio, monto) values (v_caja, v.id, v.cliente_id, 'venta', 'efectivo', v.total);
  update ventas set cobrada_en = now(), cobrada_por = auth.uid(), contada_en = now() where id = p_id;
end $$;

-- ============ 6. Pedidos por entregar y por cobrar ============
-- Incluye los pendientes, los en camino y los ya entregados que todavía no se cobraron (contra entrega).
-- El admin ve todos. Un repartidor ve los pendientes que nadie tomó y los suyos; nunca los de otro.
drop function if exists entregas();
create function entregas() returns table(id bigint, codigo text, estado text, cliente text, telefono text, direccion text, total numeric, costo_envio numeric, contra_entrega boolean, cobrada_en timestamptz,
  detalle text, cobros jsonb, repartidor_id uuid, repartidor text, created_at timestamptz, en_camino_en timestamptz, entregada_en timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, v.estado, c.nombre, c.telefono, coalesce(v.direccion, c.direccion), v.total, v.costo_envio, v.contra_entrega, v.cobrada_en,
    (select string_agg(p.nombre || ' ' || trim_scale(i.cantidad) || case when p.unidad = 'kg' then ' kg' else ' u' end, ', ' order by i.id)
       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id),
    coalesce((select jsonb_agg(jsonb_build_object('medio', g.medio, 'monto', g.monto) order by g.id) from pagos g where g.venta_id = v.id and g.tipo = 'venta'), '[]'::jsonb),
    v.repartidor_id, (select r.nombre from perfiles r where r.id = v.repartidor_id), v.created_at, v.en_camino_en, v.entregada_en
  from ventas v left join clientes c on c.id = v.cliente_id
  where v.tipo_entrega = 'delivery'
    and (v.estado in ('pendiente', 'en_camino') or (v.estado = 'entregada' and v.contra_entrega and v.cobrada_en is null))
    and (es_admin() or (mi_rol() = 'repartidor' and ((v.estado = 'pendiente' and (v.repartidor_id is null or v.repartidor_id = auth.uid())) or (v.estado <> 'pendiente' and v.repartidor_id = auth.uid()))))
  order by v.created_at $$;

-- ============ 7. Historial de repartos: incluye el cobro ============
drop function if exists historial_repartos(uuid, timestamptz, timestamptz);
create function historial_repartos(p_repartidor uuid default null, p_desde timestamptz default null, p_hasta timestamptz default null)
returns table(id bigint, codigo text, cliente text, direccion text, total numeric, costo_envio numeric, contra_entrega boolean, cobrada_en timestamptz, detalle text, en_camino_en timestamptz, entregada_en timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, c.nombre, coalesce(v.direccion, c.direccion), v.total, v.costo_envio, v.contra_entrega, v.cobrada_en,
    (select string_agg(p.nombre || ' ' || trim_scale(i.cantidad) || case when p.unidad = 'kg' then ' kg' else ' u' end, ', ' order by i.id)
       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id),
    v.en_camino_en, v.entregada_en
  from ventas v left join clientes c on c.id = v.cliente_id
  where v.tipo_entrega = 'delivery' and v.estado = 'entregada'
    and v.repartidor_id = case when es_admin() then p_repartidor when mi_rol() = 'repartidor' then auth.uid() end
    and (p_desde is null or v.entregada_en >= p_desde) and (p_hasta is null or v.entregada_en < p_hasta)
  order by v.entregada_en desc nulls last
  limit 500 $$;

-- ============ 8. Panel y "más vendidos": solo cuentan las ventas ya cobradas ============
-- Es la misma lógica de antes, pero con la fecha en que la venta cuenta (contada_en) en lugar de la fecha en que se hizo.
-- Una venta normal cuenta desde que se hace (igual que antes); una contra entrega, desde que el delivery la marca cobrada.
create or replace function panel_serie(p_desde timestamptz, p_hasta timestamptz, p_paso text, p_zona text)
returns table(periodo date, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select date_trunc(case when p_paso in ('day','week','month') then p_paso else 'day' end, v.contada_en at time zone p_zona)::date,
         count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.contada_en >= p_desde and v.contada_en < p_hasta
  group by 1 order by 1 $$;

create or replace function panel_calendario(p_desde timestamptz, p_hasta timestamptz, p_zona text)
returns table(dow int, hora int, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select extract(dow from v.contada_en at time zone p_zona)::int, extract(hour from v.contada_en at time zone p_zona)::int, count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.contada_en >= p_desde and v.contada_en < p_hasta
  group by 1, 2 $$;

create or replace function panel_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table(cantidad bigint, importe numeric, cantidad_delivery bigint, importe_delivery numeric, canceladas bigint, costo numeric, gastos numeric)
language sql stable security definer set search_path=public as $$
  select count(*) filter (where v.estado <> 'cancelada'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada'), 0),
         count(*) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'), 0),
         count(*) filter (where v.estado = 'cancelada'),
         coalesce((select sum(i.cantidad * i.costo_unitario) from venta_items i join ventas w on w.id = i.venta_id
                   where es_admin() and w.estado <> 'cancelada' and w.contada_en >= p_desde and w.contada_en < p_hasta), 0),
         coalesce((select sum(e.monto) from egresos e where es_admin() and e.tipo = 'gasto' and e.created_at >= p_desde and e.created_at < p_hasta), 0)
  from ventas v where es_admin() and v.contada_en >= p_desde and v.contada_en < p_hasta $$;

create or replace function panel_productos(p_desde timestamptz, p_hasta timestamptz)
returns table(producto_id bigint, codigo text, nombre text, categoria text, unidad text, cantidad numeric, importe numeric, costo numeric)
language sql stable security definer set search_path=public as $$
  select p.id, p.codigo, p.nombre, coalesce(c.nombre, 'Sin categoría'), p.unidad, sum(i.cantidad), sum(i.subtotal), sum(i.cantidad * i.costo_unitario)
  from venta_items i join ventas v on v.id = i.venta_id join productos p on p.id = i.producto_id left join categorias c on c.id = p.categoria_id
  where es_admin() and v.estado <> 'cancelada' and v.contada_en >= p_desde and v.contada_en < p_hasta
  group by p.id, p.codigo, p.nombre, c.nombre, p.unidad
  order by sum(i.subtotal) desc $$;

create or replace function panel_medios(p_desde timestamptz, p_hasta timestamptz) returns table(medio text, importe numeric) language sql stable security definer set search_path=public as $$
  select g.medio, sum(g.monto) from pagos g join ventas v on v.id = g.venta_id
  where es_admin() and g.tipo = 'venta' and v.estado <> 'cancelada' and v.contada_en >= p_desde and v.contada_en < p_hasta
  group by g.medio order by sum(g.monto) desc $$;

create or replace function mas_vendidos(p_limite int default 5) returns table(producto_id bigint, total numeric)
language sql stable security definer set search_path=public as $$
  select i.producto_id, sum(i.subtotal) as total
  from venta_items i join ventas v on v.id = i.venta_id
  where v.estado <> 'cancelada' and v.contada_en is not null and mi_rol() in ('admin','vendedor')
  group by i.producto_id order by sum(i.subtotal) desc limit p_limite $$;

-- ============ 9. Permisos de las funciones ============
revoke execute on function registrar_venta(bigint, text, text, jsonb, jsonb, numeric, boolean), comprobante_venta(bigint), marcar_entregada(bigint, boolean), marcar_cobrada(bigint), entregas(),
  historial_repartos(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function registrar_venta(bigint, text, text, jsonb, jsonb, numeric, boolean), comprobante_venta(bigint), marcar_entregada(bigint, boolean), marcar_cobrada(bigint), entregas(),
  historial_repartos(uuid, timestamptz, timestamptz) to authenticated;
