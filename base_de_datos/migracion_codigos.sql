-- Ejecutar UNA sola vez (después de las migraciones anteriores). NO borra datos.
-- Cada registro recibe un código único y permanente: PRO-0001 (productos), CAT-001 (categorías), CLI-0001 (clientes),
-- EMP-001 (empleados) y VEN-000001 (ventas). Se asigna solo y no se puede modificar.

create or replace function proteger_codigo() returns trigger language plpgsql as
$$ begin if new.codigo is distinct from old.codigo then raise exception 'El código no se puede modificar'; end if; return new; end $$;

do $$
declare t record;
begin
  for t in select * from (values
      ('productos','PRO',4,'id'), ('categorias','CAT',3,'id'), ('clientes','CLI',4,'id'), ('ventas','VEN',6,'id'),
      ('perfiles','EMP',3,'(select created_at from auth.users u where u.id = perfiles.id)')
    ) as v(tabla,prefijo,ancho,orden)
  loop
    execute format('create sequence if not exists seq_%s', t.tabla);
    execute format('grant usage, select on sequence seq_%s to authenticated, service_role', t.tabla);
    execute format('alter table %I add column if not exists codigo text', t.tabla);
    -- códigos para los registros que ya existían, en orden de creación
    execute format($f$ with n as (select ctid as fila, row_number() over (order by %s) as r from %I where codigo is null)
      update %I x set codigo = %L || '-' || lpad((n.r + (select count(*) from %I where codigo is not null))::text, %s, '0')
      from n where x.ctid = n.fila $f$, t.orden, t.tabla, t.tabla, t.prefijo, t.tabla, t.ancho);
    execute format('select setval(%L, (select count(*) from %I) + 1, false)', 'seq_' || t.tabla, t.tabla);
    execute format('alter table %I alter column codigo set default (%L || ''-'' || lpad(nextval(%L)::text, %s, ''0''))', t.tabla, t.prefijo, 'seq_' || t.tabla, t.ancho);
    execute format('alter table %I alter column codigo set not null', t.tabla);
    execute format('create unique index if not exists %I on %I(codigo)', t.tabla || '_codigo_uk', t.tabla);
    execute format('drop trigger if exists proteger_codigo on %I', t.tabla);
    execute format('create trigger proteger_codigo before update on %I for each row execute function proteger_codigo()', t.tabla);
  end loop;
end $$;

-- entregas() ahora también devuelve el código de la venta
drop function if exists entregas();
create function entregas() returns table(id bigint, codigo text, estado text, cliente text, telefono text, direccion text, total numeric, detalle text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select v.id, v.codigo, v.estado, c.nombre, c.telefono, coalesce(v.direccion,c.direccion), v.total,
    (select string_agg(p.nombre||' '||i.cantidad||case when p.unidad='kg' then ' kg' else ' u' end, ', ')
       from venta_items i join productos p on p.id=i.producto_id where i.venta_id=v.id), v.created_at
  from ventas v left join clientes c on c.id=v.cliente_id
  where mi_rol() in ('admin','repartidor') and v.tipo_entrega='delivery'
    and (v.estado='pendiente' or (v.estado='entregada' and v.created_at>now()-interval '1 day'))
  order by v.created_at $$;
revoke execute on function entregas() from public, anon;
grant execute on function entregas() to authenticated;
