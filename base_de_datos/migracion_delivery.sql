-- Migración 9: delivery completo. Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema y NO borra datos. En una instalación nueva, ejecutarla después de esquema.sql y de la migración 8.
--
-- Agrega: costo de envío opcional, estado "en camino", repartidor asignado, quién entregó y a qué hora,
-- cobro visible para el repartidor, y el historial de repartos de cada repartidor (el repartidor solo ve el suyo; el admin ve el de cualquiera).
--
-- Flujo de un delivery:   pendiente --(asigna el admin, opcional)--> pendiente --(el repartidor sale)--> en_camino --> entregada
--                         también se puede marcar entregada directo desde pendiente. Cancelar sigue siendo solo del admin.

-- ============ 1. Columnas nuevas en ventas ============
alter table ventas add column if not exists costo_envio numeric(10,2) not null default 0 check (costo_envio >= 0);   -- ya está incluido en ventas.total
alter table ventas add column if not exists repartidor_id uuid references perfiles(id) on delete set null;            -- quién lo reparte (o lo repartió)
alter table ventas add column if not exists en_camino_en timestamptz;                                                -- cuándo salió a repartir
alter table ventas add column if not exists entregada_en timestamptz;                                                -- cuándo se entregó
alter table ventas add column if not exists entregada_por uuid;                                                      -- quién registró la entrega (el repartidor o el admin)

do $$ declare r record; begin   -- reemplaza el control de estados para agregar "en_camino"
  for r in select conname from pg_constraint where conrelid = 'public.ventas'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%estado%' loop
    execute format('alter table ventas drop constraint %I', r.conname);
  end loop;
end $$;
alter table ventas add constraint ventas_estado_check check (estado in ('completada','pendiente','en_camino','entregada','cancelada'));
alter table ventas drop constraint if exists ventas_envio_valido;
alter table ventas add constraint ventas_envio_valido check (costo_envio = 0 or tipo_entrega = 'delivery');   -- solo un delivery puede tener envío
create index if not exists ventas_repartidor_ix on ventas(repartidor_id, entregada_en desc) where tipo_entrega = 'delivery';

-- ============ 2. Venta con costo de envío opcional ============
-- Es la misma función de antes más el envío: se suma al total, se cobra junto con los productos y queda guardado aparte.
drop function if exists registrar_venta(bigint, text, text, jsonb, jsonb);
create function registrar_venta(p_cliente bigint, p_tipo text, p_direccion text, p_items jsonb, p_pagos jsonb, p_costo_envio numeric default 0) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_caja bigint; it jsonb; pg jsonb; pr productos; q numeric; sub numeric; tot numeric := 0; pagado numeric := 0; m numeric; v_medio text; v_envio numeric := round(coalesce(p_costo_envio, 0), 2);
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if p_tipo is null or p_tipo not in ('mostrador','delivery') then raise exception 'Tipo de entrega inválido'; end if;
  if p_tipo = 'delivery' and nullif(trim(coalesce(p_direccion, '')), '') is null then raise exception 'Ingresá la dirección de entrega'; end if;
  if v_envio < 0 then raise exception 'El costo de envío no puede ser negativo'; end if;
  if v_envio > 0 and p_tipo <> 'delivery' then raise exception 'El costo de envío solo corresponde a un delivery'; end if;
  v_caja := caja_abierta();
  if v_caja is null then raise exception 'No hay una caja abierta. Abrila en la pestaña Caja para registrar ventas'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;
  if p_cliente is not null and not exists (select 1 from clientes where id = p_cliente and activo) then raise exception 'El cliente no existe o está desactivado'; end if;
  insert into ventas(cliente_id, total, tipo_entrega, direccion, estado)
    values (p_cliente, 0, p_tipo, nullif(trim(p_direccion), ''), case when p_tipo = 'delivery' then 'pendiente' else 'completada' end) returning id into v_id;
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

-- ============ 3. Comprobante: ahora incluye el envío, el repartidor y la fecha de entrega ============
create or replace function comprobante_venta(p_id bigint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v ventas;
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id;
  if not found then raise exception 'Venta inexistente'; end if;
  return jsonb_build_object('codigo', v.codigo, 'fecha', v.created_at, 'estado', v.estado, 'total', v.total, 'costo_envio', v.costo_envio, 'tipo_entrega', v.tipo_entrega, 'direccion', v.direccion,
    'repartidor', (select nombre from perfiles where id = v.repartidor_id), 'entregada_en', v.entregada_en,
    'vendedor', (select nombre from perfiles where id = v.vendedor_id),
    'cliente', (select jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'telefono', c.telefono) from clientes c where c.id = v.cliente_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'unidad', p.unidad, 'cantidad', i.cantidad, 'precio', i.precio_unitario, 'subtotal', i.subtotal) order by i.id)
                       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('medio', g.medio, 'monto', g.monto) order by g.id) from pagos g where g.venta_id = v.id and g.tipo = 'venta'), '[]'::jsonb),
    'saldo_cliente', (select coalesce(sum(case when g.medio = 'deuda' then g.monto else -g.monto end), 0) from pagos g
                      where v.cliente_id is not null and g.cliente_id = v.cliente_id and (g.medio = 'deuda' or g.tipo = 'cobro_deuda')));
end $$;

-- ============ 4. Pedidos por entregar ============
-- El admin ve todos. Un repartidor ve los que nadie tomó y los que son suyos; nunca los de otro repartidor.
-- Incluye cómo se pagó cada pedido (cobros), para que el repartidor sepa si queda algo a cuenta.
drop function if exists entregas();
create function entregas() returns table(id bigint, codigo text, estado text, cliente text, telefono text, direccion text, total numeric, costo_envio numeric, detalle text, cobros jsonb,
  repartidor_id uuid, repartidor text, created_at timestamptz, en_camino_en timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, v.estado, c.nombre, c.telefono, coalesce(v.direccion, c.direccion), v.total, v.costo_envio,
    (select string_agg(p.nombre || ' ' || trim_scale(i.cantidad) || case when p.unidad = 'kg' then ' kg' else ' u' end, ', ' order by i.id)
       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id),
    coalesce((select jsonb_agg(jsonb_build_object('medio', g.medio, 'monto', g.monto) order by g.id) from pagos g where g.venta_id = v.id and g.tipo = 'venta'), '[]'::jsonb),
    v.repartidor_id, (select r.nombre from perfiles r where r.id = v.repartidor_id), v.created_at, v.en_camino_en
  from ventas v left join clientes c on c.id = v.cliente_id
  where v.tipo_entrega = 'delivery' and v.estado in ('pendiente', 'en_camino')
    and (es_admin() or (mi_rol() = 'repartidor' and (v.repartidor_id is null or v.repartidor_id = auth.uid())))
  order by v.created_at $$;

-- ============ 5. El repartidor sale a repartir ============
create function tomar_entrega(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare v ventas;
begin
  if coalesce(mi_rol(), '') <> 'repartidor' then raise exception 'Solo un repartidor puede salir a repartir un pedido'; end if;
  select * into v from ventas where id = p_id and tipo_entrega = 'delivery' for update;
  if not found then raise exception 'Pedido de delivery inexistente'; end if;
  if v.estado <> 'pendiente' then raise exception 'El pedido ya no está pendiente (estado: %)', v.estado; end if;
  if v.repartidor_id is not null and v.repartidor_id <> auth.uid() then raise exception 'El pedido está asignado a otro repartidor'; end if;
  update ventas set estado = 'en_camino', repartidor_id = auth.uid(), en_camino_en = now() where id = p_id;
end $$;

-- ============ 6. Marcar entregada: ahora deja quién y cuándo, y avisa si no se puede ============
-- Antes, marcar un pedido que no estaba pendiente no hacía nada y tampoco avisaba.
create or replace function marcar_entregada(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare v ventas; v_rol text := mi_rol();
begin
  if coalesce(v_rol, '') not in ('admin','repartidor') then raise exception 'No autorizado'; end if;
  select * into v from ventas where id = p_id and tipo_entrega = 'delivery' for update;
  if not found then raise exception 'Pedido de delivery inexistente'; end if;
  if v.estado not in ('pendiente','en_camino') then raise exception 'El pedido no se puede marcar como entregado (estado: %)', v.estado; end if;
  if v_rol = 'repartidor' and v.repartidor_id is not null and v.repartidor_id <> auth.uid() then raise exception 'El pedido está asignado a otro repartidor'; end if;
  update ventas set estado = 'entregada', entregada_en = now(), entregada_por = auth.uid(),
    repartidor_id = case when v_rol = 'repartidor' then auth.uid() else v.repartidor_id end
  where id = p_id;
end $$;

-- ============ 7. El admin asigna (o quita) el repartidor de un pedido ============
create function asignar_repartidor(p_id bigint, p_repartidor uuid) returns void language plpgsql security definer set search_path=public as $$
declare v ventas;
begin
  if not es_admin() then raise exception 'Solo el administrador puede asignar repartidores'; end if;
  select * into v from ventas where id = p_id and tipo_entrega = 'delivery' for update;
  if not found then raise exception 'Pedido de delivery inexistente'; end if;
  if v.estado not in ('pendiente','en_camino') then raise exception 'Solo se puede asignar un pedido pendiente o en camino (estado: %)', v.estado; end if;
  if p_repartidor is not null and not exists (select 1 from perfiles where id = p_repartidor and rol = 'repartidor' and activo) then raise exception 'El repartidor no existe o está desactivado'; end if;
  if v.repartidor_id is distinct from p_repartidor then   -- si cambia el repartidor, el pedido vuelve a "pendiente" hasta que el nuevo salga
    update ventas set repartidor_id = p_repartidor, estado = 'pendiente', en_camino_en = null where id = p_id;
  end if;
end $$;

-- ============ 8. Historial de repartos ============
-- Un repartidor recibe SIEMPRE solo los suyos (aunque pida otro id). El admin elige el repartidor. Cualquier otro rol no recibe nada.
create function historial_repartos(p_repartidor uuid default null, p_desde timestamptz default null, p_hasta timestamptz default null)
returns table(id bigint, codigo text, cliente text, direccion text, total numeric, costo_envio numeric, detalle text, en_camino_en timestamptz, entregada_en timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, c.nombre, coalesce(v.direccion, c.direccion), v.total, v.costo_envio,
    (select string_agg(p.nombre || ' ' || trim_scale(i.cantidad) || case when p.unidad = 'kg' then ' kg' else ' u' end, ', ' order by i.id)
       from venta_items i join productos p on p.id = i.producto_id where i.venta_id = v.id),
    v.en_camino_en, v.entregada_en
  from ventas v left join clientes c on c.id = v.cliente_id
  where v.tipo_entrega = 'delivery' and v.estado = 'entregada'
    and v.repartidor_id = case when es_admin() then p_repartidor when mi_rol() = 'repartidor' then auth.uid() end
    and (p_desde is null or v.entregada_en >= p_desde) and (p_hasta is null or v.entregada_en < p_hasta)
  order by v.entregada_en desc nulls last
  limit 500 $$;

-- ============ 9. Permisos de las funciones ============
revoke execute on function registrar_venta(bigint, text, text, jsonb, jsonb, numeric), comprobante_venta(bigint), entregas(), tomar_entrega(bigint), marcar_entregada(bigint),
  asignar_repartidor(bigint, uuid), historial_repartos(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function registrar_venta(bigint, text, text, jsonb, jsonb, numeric), comprobante_venta(bigint), entregas(), tomar_entrega(bigint), marcar_entregada(bigint),
  asignar_repartidor(bigint, uuid), historial_repartos(uuid, timestamptz, timestamptz) to authenticated;
