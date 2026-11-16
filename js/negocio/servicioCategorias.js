import { RepositorioCategorias } from '../datos/repositorioCategorias.js';
import { porEstado, opcionesActivos } from './filtros.js';
const traducir = e => { throw new Error(/duplicate|unique/i.test(e.message) ? 'Ya existe una categoría con ese nombre' : e.message); };
export const ServicioCategorias = {
  listar: () => RepositorioCategorias.listar(),
  async crear(nombre) {
    if (!nombre?.trim()) throw new Error('Ingresá el nombre de la categoría');
    try { await RepositorioCategorias.crear({ nombre: nombre.trim() }); } catch (e) { traducir(e); }
  },
  async renombrar(c, nombre) {
    if (!nombre?.trim()) throw new Error('El nombre no puede quedar vacío');
    try { await RepositorioCategorias.actualizar(c.id, { nombre: nombre.trim() }); } catch (e) { traducir(e); }
  },
  // Las categorías no se eliminan: se desactivan (los productos que ya las usan no se ven afectados)
  alternar: c => RepositorioCategorias.actualizar(c.id, { activo: !c.activo }),
  opciones: lista => opcionesActivos(lista),
  filtrar: (lista, { vista, busqueda }) => porEstado(lista, vista, busqueda, c => [c.nombre, c.codigo]),
};
