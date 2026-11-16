import { coincide } from './texto.js';
// Los registros desactivados se ven SIEMPRE en una vista aparte ("inactivos"), nunca mezclados con los activos
export const porEstado = (lista, vista, busqueda, campos) =>
  lista.filter(x => (vista === 'inactivos' ? !x.activo : x.activo) && coincide(busqueda, ...campos(x)));
export const opcionesActivos = (lista, textoTodos = 'Todos') => [
  { id: 'todos', texto: textoTodos, cuenta: lista.filter(x => x.activo).length },
  { id: 'inactivos', texto: 'Desactivados', cuenta: lista.filter(x => !x.activo).length, aparte: true },
];
