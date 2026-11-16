-- Ejecutar UNA sola vez. NO borra datos.
-- Devuelve los productos más vendidos (por importe, sin contar ventas canceladas). Lo usa la vista "Todos" de Productos.
create or replace function mas_vendidos(p_limite int default 5) returns table(producto_id bigint, total numeric)
language sql stable security definer set search_path=public as $$
  select i.producto_id, sum(i.subtotal) as total
  from venta_items i join ventas v on v.id = i.venta_id
  where v.estado <> 'cancelada' and mi_rol() in ('admin','vendedor')
  group by i.producto_id order by sum(i.subtotal) desc limit p_limite $$;
revoke execute on function mas_vendidos(int) from public, anon;
grant execute on function mas_vendidos(int) to authenticated;
