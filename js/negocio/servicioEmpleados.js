import { RepositorioEmpleados } from '../datos/repositorioEmpleados.js';
import { ServicioAutenticacion } from './servicioAutenticacion.js';
import { coincide } from './texto.js';
import { CORREO_BASE } from '../configuracion.js';
export const ROLES = ['vendedor', 'repartidor', 'admin'];
const FORMATO_USUARIO = /^[a-z0-9._-]{3,20}$/;
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const yo = () => ServicioAutenticacion.usuario()?.id;
const validarClave = c => { if ((c || '').length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres'); };
const validarUsuario = u => { if (!FORMATO_USUARIO.test(u)) throw new Error('El usuario debe tener de 3 a 20 caracteres: letras minúsculas, números, punto, guion o guion bajo'); };
// Si el empleado no tiene correo propio, Supabase necesita uno interno: base+usuario@dominio
const correoInterno = u => { const [local, dominio] = CORREO_BASE.split('@'); return `${local}+${u}@${dominio}`; };
const traducir = e => { throw new Error(/duplicate|unique/i.test(e.message) ? 'Ese usuario ya existe' : e.message); };
export const ServicioEmpleados = {
  listar: () => RepositorioEmpleados.listar(),
  // Vistas: Todos + una por rol + Desactivados (aparte)
  opciones(lista) {
    const act = lista.filter(e => e.activo), n = r => act.filter(e => e.rol === r).length;
    return [{ id: 'todos', texto: 'Todos', cuenta: act.length }, { id: 'rol:admin', texto: 'Administradores', cuenta: n('admin') },
      { id: 'rol:vendedor', texto: 'Vendedores', cuenta: n('vendedor') }, { id: 'rol:repartidor', texto: 'Repartidores', cuenta: n('repartidor') },
      { id: 'inactivos', texto: 'Desactivados', cuenta: lista.length - act.length, aparte: true }];
  },
  filtrar(lista, { vista, busqueda }) {
    const coin = e => coincide(busqueda, e.nombre, e.usuario, e.codigo, e.correo);
    if (vista === 'inactivos') return lista.filter(e => !e.activo && coin(e));
    const rol = vista.startsWith('rol:') ? vista.slice(4) : null;
    return lista.filter(e => e.activo && (!rol || e.rol === rol) && coin(e));
  },
  crear({ nombre, usuario, correo, rol, clave }) {
    const u = String(usuario || '').trim().toLowerCase(), c = String(correo || '').trim().toLowerCase();
    if (!nombre?.trim()) throw new Error('Ingresá el nombre del empleado');
    validarUsuario(u);
    if (c && !FORMATO_CORREO.test(c)) throw new Error('El correo no es válido');
    if (!ROLES.includes(rol)) throw new Error('Rol inválido');
    validarClave(clave);
    return RepositorioEmpleados.crear({ nombre: nombre.trim(), usuario: u, correo: c || null, rol, password: clave, email: c || correoInterno(u) });
  },
  cambiarNombre(e, nombre) {
    if (!nombre?.trim()) throw new Error('El nombre no puede quedar vacío');
    return RepositorioEmpleados.actualizar(e.id, { nombre: nombre.trim() });
  },
  async cambiarUsuario(e, usuario) {
    const u = String(usuario || '').trim().toLowerCase(); validarUsuario(u);
    try { await RepositorioEmpleados.actualizar(e.id, { usuario: u }); } catch (err) { traducir(err); }
  },
  cambiarRol(e, rol) {
    if (!ROLES.includes(rol)) throw new Error('Rol inválido');
    if (e.id === yo() && rol !== 'admin') throw new Error('No podés quitarte el rol de administrador a vos mismo');
    return RepositorioEmpleados.actualizar(e.id, { rol });
  },
  alternarActivo(e) {
    if (e.id === yo()) throw new Error('No podés desactivar tu propia cuenta');
    return RepositorioEmpleados.actualizar(e.id, { activo: !e.activo });
  },
  cambiarClave(e, clave) { validarClave(clave); return RepositorioEmpleados.cambiarClave(e.id, clave); },
};
