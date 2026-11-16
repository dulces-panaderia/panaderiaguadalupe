-- Ejecutar UNA sola vez (después de las migraciones anteriores). NO borra datos.
create table if not exists categorias(id bigint generated always as identity primary key, nombre text not null, activo boolean not null default true);
create unique index if not exists categorias_nombre_uk on categorias(lower(nombre));
alter table categorias enable row level security;
drop policy if exists "ver" on categorias; drop policy if exists "alta" on categorias; drop policy if exists "mod" on categorias;
create policy "ver" on categorias for select to authenticated using (mi_rol() in ('admin','vendedor'));
create policy "alta" on categorias for insert to authenticated with check (es_admin());
create policy "mod" on categorias for update to authenticated using (es_admin()) with check (es_admin());

alter table productos add column if not exists categoria_id bigint references categorias;
-- Pasa las categorías que ya tenías escritas como texto a la nueva tabla (la columna "categoria" vieja queda sin usar)
insert into categorias(nombre) select distinct trim(categoria) from productos where trim(coalesce(categoria,'')) <> '' on conflict do nothing;
update productos p set categoria_id = c.id from categorias c where p.categoria_id is null and lower(trim(p.categoria)) = lower(c.nombre);
