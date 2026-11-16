-- Migración 8: cada dato tiene UN solo origen y no se pisa. Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema y NO borra datos. En una instalación nueva, ejecutarla después de esquema.sql.
--
--   stock    entra solo con una COMPRA, sale con las ventas, y se corrige solo con un AJUSTE (con motivo, queda en el historial)
--   costo    se calcula solo: costo promedio de las compras (nadie lo escribe a mano)
--   precio, nombre, categoría, unidad, stock mínimo y estado: se editan en Productos

-- ============ 1. Permisos por columna ============
-- Un producto nuevo nace con stock 0 y costo 0, y el stock y el costo no se pueden escribir directamente (ni desde la aplicación ni por la API).
-- Las funciones registrar_compra, registrar_venta, cancelar_venta y ajustar_stock son "security definer": siguen pudiendo modificarlos.
revoke insert, update on productos from authenticated, anon;
do $$ declare cols text; begin   -- se permite escribir todo salvo id, código, stock y costo (las columnas se leen de la tabla real)
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
    where table_schema = 'public' and table_name = 'productos' and column_name not in ('id', 'codigo', 'stock', 'costo');
  execute 'grant insert (' || cols || ') on productos to authenticated';
  execute 'grant update (' || cols || ') on productos to authenticated';
end $$;

-- ============ 2. Compra: el costo desconocido no diluye el promedio ============
-- Antes, si el producto tenía stock pero costo 0 (desconocido), la primera compra mezclaba ese stock "gratis" en el promedio y bajaba el costo real.
-- Ahora, si no había stock o el costo era 0, el costo pasa a ser el de la compra. El resto de la función es igual que antes.
create or replace function registrar_compra(p_proveedor bigint, p_items jsonb, p_pagos jsonb, p_nota text default null) returns bigint
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
    nuevo := case when pr.stock <= 0 or pr.costo = 0 then c else round((pr.stock * pr.costo + q * c) / (pr.stock + q), 4) end;   -- costo promedio ponderado; si no había stock o el costo era desconocido (0), queda el de esta compra
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
