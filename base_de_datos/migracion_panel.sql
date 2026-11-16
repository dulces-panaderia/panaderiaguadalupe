-- Ejecutar UNA sola vez. NO borra datos. Solo el administrador puede usar estas funciones.
-- Agrupan las ventas en la base (rápido y sin el límite de 1000 filas), respetando la zona horaria del navegador.

create or replace function panel_resumen(p_desde timestamptz, p_hasta timestamptz)
returns table(cantidad bigint, importe numeric, cantidad_delivery bigint, importe_delivery numeric, canceladas bigint)
language sql stable security definer set search_path=public as $$
  select count(*) filter (where v.estado <> 'cancelada'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada'), 0),
         count(*) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'),
         coalesce(sum(v.total) filter (where v.estado <> 'cancelada' and v.tipo_entrega = 'delivery'), 0),
         count(*) filter (where v.estado = 'cancelada')
  from ventas v where es_admin() and v.created_at >= p_desde and v.created_at < p_hasta $$;

create or replace function panel_serie(p_desde timestamptz, p_hasta timestamptz, p_paso text, p_zona text)
returns table(periodo date, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select date_trunc(case when p_paso in ('day','week','month') then p_paso else 'day' end, v.created_at at time zone p_zona)::date,
         count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by 1 order by 1 $$;

create or replace function panel_productos(p_desde timestamptz, p_hasta timestamptz)
returns table(producto_id bigint, codigo text, nombre text, categoria text, unidad text, cantidad numeric, importe numeric)
language sql stable security definer set search_path=public as $$
  select p.id, p.codigo, p.nombre, coalesce(c.nombre, 'Sin categoría'), p.unidad, sum(i.cantidad), sum(i.subtotal)
  from venta_items i
  join ventas v on v.id = i.venta_id
  join productos p on p.id = i.producto_id
  left join categorias c on c.id = p.categoria_id
  where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by p.id, p.codigo, p.nombre, c.nombre, p.unidad
  order by sum(i.subtotal) desc $$;

create or replace function panel_calendario(p_desde timestamptz, p_hasta timestamptz, p_zona text)
returns table(dow int, hora int, cantidad bigint, importe numeric)
language sql stable security definer set search_path=public as $$
  select extract(dow from v.created_at at time zone p_zona)::int, extract(hour from v.created_at at time zone p_zona)::int, count(*), sum(v.total)
  from ventas v where es_admin() and v.estado <> 'cancelada' and v.created_at >= p_desde and v.created_at < p_hasta
  group by 1, 2 $$;

revoke execute on function panel_resumen(timestamptz,timestamptz), panel_serie(timestamptz,timestamptz,text,text),
  panel_productos(timestamptz,timestamptz), panel_calendario(timestamptz,timestamptz,text) from public, anon;
grant execute on function panel_resumen(timestamptz,timestamptz), panel_serie(timestamptz,timestamptz,text,text),
  panel_productos(timestamptz,timestamptz), panel_calendario(timestamptz,timestamptz,text) to authenticated;
