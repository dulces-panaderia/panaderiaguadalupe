import { RepositorioAutenticacion } from '../datos/repositorioAutenticacion.js';
// Regla de negocio: qué pantallas corresponden a cada rol
const PESTANAS = {
  admin: ['vender', 'caja', 'prod', 'cat', 'cli', 'ventas', 'comp', 'prov', 'mov', 'entregas', 'dash', 'emp'],
  vendedor: ['vender', 'caja', 'cli', 'ventas'],
  repartidor: ['entregas'],
  pendiente: ['pend'],
  inactivo: ['pend'],
};
let actual = null;
let ultimoId;   // último usuario procesado (undefined = todavía ninguno)
export const ServicioAutenticacion = {
  // Acepta nombre de usuario o correo electrónico
  async ingresar(identificador, clave) {
    const id = String(identificador || '').trim().toLowerCase();
    if (!id || !clave) throw new Error('Ingresá tu usuario (o correo) y tu contraseña');
    try {
      if (id.includes('@')) await RepositorioAutenticacion.iniciarSesion(id, clave);
      else await RepositorioAutenticacion.iniciarSesionPorUsuario(id, clave);
    } catch (e) {
      if (/invalid login|incorrectos/i.test(e.message)) throw new Error('Usuario o contraseña incorrectos');
      if (/rate limit|too many/i.test(e.message)) throw new Error('Demasiados intentos. Esperá un minuto y probá de nuevo');
      throw e;
    }
  },
  salir: () => RepositorioAutenticacion.cerrarSesion(),
  usuario: () => actual,
  esAdmin: () => actual?.rol === 'admin',
  alCambiarSesion(devolucion) {
    RepositorioAutenticacion.alCambiarSesion(async u => {
      const id = u?.id || null;
      if (id === ultimoId) return; // ignora eventos repetidos y renovaciones de token
      ultimoId = id;
      if (!u) { actual = null; return devolucion(null); }
      let perfil = null;
      try { perfil = await RepositorioAutenticacion.perfil(u.id); } catch { /* sin perfil => pendiente */ }
      const rol = perfil ? (perfil.activo === false ? 'inactivo' : perfil.rol) : 'pendiente';
      actual = { id: u.id, nombre: perfil?.nombre || u.email, usuario: perfil?.usuario, rol, pestanas: PESTANAS[rol] || ['pend'] };
      devolucion(actual);
    });
  },
};
