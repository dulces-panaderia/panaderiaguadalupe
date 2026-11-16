import { bd, extraer, invocarFuncion } from './clienteSupabase.js';
export const RepositorioAutenticacion = {
  iniciarSesion: async (correo, clave) => extraer(await bd.auth.signInWithPassword({ email: correo, password: clave })),
  // El servidor resuelve el correo a partir del usuario (así nunca se expone el correo de nadie)
  async iniciarSesionPorUsuario(usuario, clave) {
    const { sesion } = await invocarFuncion({ accion: 'acceso', usuario, clave });
    extraer(await bd.auth.setSession(sesion));
  },
  cerrarSesion: () => bd.auth.signOut(),
  // OJO: Supabase se bloquea si dentro de este evento se llama a otra función de Supabase (por ejemplo, leer el perfil).
  // Por eso la respuesta se entrega en el siguiente ciclo (setTimeout), fuera del bloqueo.
  alCambiarSesion: cb => bd.auth.onAuthStateChange((_evento, s) => {
    const usuario = s ? { id: s.user.id, email: s.user.email } : null;
    setTimeout(() => cb(usuario), 0);
  }),
  perfil: async id => extraer(await bd.from('perfiles').select('nombre,usuario,rol,activo').eq('id', id).single()),
};
