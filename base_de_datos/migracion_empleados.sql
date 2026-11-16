-- Ejecutar UNA sola vez en Supabase > SQL Editor si ya habías ejecutado el esquema anterior. NO borra datos.
alter table perfiles add column if not exists usuario text;
alter table perfiles add column if not exists activo boolean not null default true;
update perfiles set usuario = lower(coalesce(usuario, nombre)) where usuario is null;
create unique index if not exists perfiles_usuario_uk on perfiles(lower(usuario));

-- Una cuenta desactivada pierde todos sus permisos
create or replace function mi_rol() returns text language sql stable security definer set search_path=public as
$$ select rol from perfiles where id=auth.uid() and activo $$;

create or replace function nuevo_usuario() returns trigger language plpgsql security definer set search_path=public as
$$ begin insert into perfiles(id,nombre,usuario,rol) values(new.id, split_part(new.email,'@',1), lower(split_part(new.email,'@',1)),
  case when exists(select 1 from perfiles) then 'pendiente' else 'admin' end); return new; end $$;
