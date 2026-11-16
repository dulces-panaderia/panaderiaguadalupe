// Función de Supabase (el nombre con que la publiques debe coincidir con NOMBRE_FUNCION en js/configuracion.js). Acciones:
//   acceso  (pública)  inicia sesión con un nombre de usuario o correo y devuelve la sesión; el correo nunca se expone
//   crear / clave      solo un administrador activo (se usa la clave service_role, que Supabase inyecta dentro de la función)
// No existe la acción "eliminar": las cuentas se desactivan desde la tabla perfiles.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cabeceras = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cabeceras, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabeceras });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const b = await req.json();

    if (b.accion === 'acceso') {
      const fallo = () => responder({ error: 'Usuario o contraseña incorrectos' }, 401);
      const identificador = String(b.usuario || '').trim().toLowerCase();
      if (!identificador || !b.clave) return fallo();
      let correo: string | undefined = identificador;
      if (!identificador.includes('@')) {
        const { data: p } = await admin.from('perfiles').select('id').eq('usuario', identificador).maybeSingle();
        if (!p) return fallo();
        correo = (await admin.auth.admin.getUserById(p.id)).data.user?.email;
        if (!correo) return fallo();
      }
      const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: correo, password: b.clave });
      if (error || !data.session) return fallo();
      return responder({ sesion: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
    }

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return responder({ error: 'No autenticado' }, 401);
    const { data: perfil } = await admin.from('perfiles').select('rol,activo').eq('id', user.id).single();
    if (perfil?.rol !== 'admin' || !perfil.activo) return responder({ error: 'Solo el administrador puede gestionar empleados' }, 403);

    if (b.accion === 'crear') {
      if (!['vendedor', 'repartidor', 'admin'].includes(b.rol)) return responder({ error: 'Rol inválido' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true });
      if (error) return responder({ error: /already|registered/i.test(error.message) ? 'Ese usuario o correo ya existe' : error.message }, 400);
      const { error: e2 } = await admin.from('perfiles').update({ usuario: b.usuario, nombre: b.nombre, correo: b.correo || null, rol: b.rol, activo: true }).eq('id', data.user.id);
      if (e2) { await admin.auth.admin.deleteUser(data.user.id); return responder({ error: /duplicate|unique/i.test(e2.message) ? 'Ese usuario ya existe' : e2.message }, 400); }
      return responder({ ok: true });
    }
    if (b.accion === 'clave') {
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
      return error ? responder({ error: error.message }, 400) : responder({ ok: true });
    }
    return responder({ error: 'Acción inválida' }, 400);
  } catch (e) { return responder({ error: String(e) }, 500); }
});
