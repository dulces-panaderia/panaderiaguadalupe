-- Migración 10: las funciones de caja y cobros rechazan a quien no tiene un rol activo. Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin problema y NO borra datos.
--
-- Problema: estas funciones preguntaban "mi_rol() not in ('admin','vendedor')". Un empleado desactivado (o sin perfil) tiene mi_rol() vacío (null),
-- y "null not in (...)" no es verdadero ni falso: la comprobación no rechazaba y la función se ejecutaba igual por la API mientras la sesión siguiera abierta.
-- Corrección: coalesce(mi_rol(), '') convierte el vacío en un rol que no existe, así queda rechazado.
-- El resto de las funciones ya estaban bien (usan es_admin(), que ya trata el vacío como "no es admin") o se corrigieron en la migración 9
-- (registrar_venta, comprobante_venta y marcar_entregada). Son las mismas funciones de antes: solo cambia esa línea.

create or replace function abrir_caja(p_monto_inicial numeric) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if p_monto_inicial is null or p_monto_inicial < 0 then raise exception 'El monto inicial no es válido'; end if;
  insert into cajas(monto_inicial) values (round(p_monto_inicial, 2)) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una caja abierta';
end $$;

create or replace function resumen_caja(p_caja bigint) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c cajas;
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
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

create or replace function cerrar_caja(p_contado numeric, p_observaciones text default null) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint := caja_abierta(); v_esperado numeric;
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if v_id is null then raise exception 'No hay una caja abierta'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'El efectivo contado no es válido'; end if;
  v_esperado := (resumen_caja(v_id) ->> 'efectivo_esperado')::numeric;
  update cajas set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), efectivo_esperado = v_esperado,
    efectivo_contado = round(p_contado, 2), diferencia = round(p_contado, 2) - v_esperado, observaciones = nullif(trim(p_observaciones), '')
  where id = v_id;
  return v_id;
end $$;

create or replace function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text, p_nota text default null) returns bigint language plpgsql security definer set search_path=public as $$
declare v_caja bigint := caja_abierta(); v_saldo numeric; v_id bigint; m numeric := round(p_monto, 2);
begin
  if coalesce(mi_rol(), '') not in ('admin','vendedor') then raise exception 'No autorizado'; end if;
  if v_caja is null then raise exception 'No hay una caja abierta. Abrila en la pestaña Caja para registrar cobros'; end if;
  if p_medio is null or p_medio not in ('efectivo','transferencia','tarjeta') then raise exception 'Medio de pago inválido'; end if;
  if m is null or m <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if not exists (select 1 from clientes where id = p_cliente) then raise exception 'Cliente inexistente'; end if;
  select coalesce(sum(case when medio = 'deuda' then monto else -monto end), 0) into v_saldo from pagos where cliente_id = p_cliente and (medio = 'deuda' or tipo = 'cobro_deuda');
  if m > v_saldo + 0.005 then raise exception 'El monto supera la deuda del cliente ($%)', v_saldo; end if;
  insert into pagos(caja_id, cliente_id, tipo, medio, monto, nota) values (v_caja, p_cliente, 'cobro_deuda', p_medio, m, nullif(trim(p_nota), '')) returning id into v_id;
  return v_id;
end $$;
