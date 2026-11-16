-- Ejecutar UNA sola vez (después de migracion_empleados.sql). NO borra datos.
alter table perfiles add column if not exists correo text;
update perfiles p set correo = u.email from auth.users u
  where u.id = p.id and p.correo is null and position('+' in u.email) = 0;   -- cuentas con correo real

alter table clientes add column if not exists activo boolean not null default true;

-- Nada se elimina desde la aplicación: se quitan los permisos de borrado
drop policy if exists "baja" on clientes;
drop policy if exists "admin" on productos;
drop policy if exists "alta" on productos;
drop policy if exists "mod" on productos;
create policy "alta" on productos for insert to authenticated with check (es_admin());
create policy "mod" on productos for update to authenticated using (es_admin()) with check (es_admin());
