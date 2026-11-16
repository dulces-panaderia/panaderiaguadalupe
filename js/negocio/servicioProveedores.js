import { RepositorioProveedores } from '../datos/repositorioProveedores.js';
import { porEstado, opcionesActivos } from './filtros.js';
const traducir = e => { throw new Error(/duplicate|unique/i.test(e.message) ? 'Ya existe un proveedor con ese nombre' : e.message); };
export const ServicioProveedores = {
  listar: () => RepositorioProveedores.listar(),
  async crear(o) {
    if (!o.nombre?.trim()) throw new Error('Ingresá el nombre del proveedor');
    if (o.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.correo.trim())) throw new Error('El correo no es válido');
    try { await RepositorioProveedores.crear({ nombre: o.nombre.trim(), telefono: o.telefono?.trim() || null, correo: o.correo?.trim().toLowerCase() || null, direccion: o.direccion?.trim() || null, notas: o.notas?.trim() || null }); } catch (e) { traducir(e); }
  },
  alternar: p => RepositorioProveedores.actualizar(p.id, { activo: !p.activo }),
  opciones: lista => opcionesActivos(lista),
  filtrar: (lista, { vista, busqueda }) => porEstado(lista, vista, busqueda, p => [p.nombre, p.codigo, p.telefono, p.correo]),
};
