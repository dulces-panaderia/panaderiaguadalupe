import { $, escapar, mostrarMensaje, delegar, etiqueta, editarEnLinea, limpiar, selector } from './utilidades.js';
import { ServicioCategorias } from '../negocio/servicioCategorias.js';
let categorias = [], vista = 'todos', busqueda = '';
export function iniciar() {
  $('bus_cat').addEventListener('input', () => { busqueda = $('bus_cat').value; pintar(); });
  delegar($('s_cat'), async (accion, d, boton) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'guardar') { await ServicioCategorias.crear($('kn').value); limpiar('kn'); mostrarMensaje('Categoría guardada'); }
    else {
      const c = categorias.find(x => x.id === +d.id);
      if (accion === 'renombrar') return editarEnLinea(boton.closest('td'), { valor: c.nombre, alCancelar: pintar,
        alGuardar: async v => { await ServicioCategorias.renombrar(c, v); mostrarMensaje('Categoría renombrada'); await dibujar(); } });
      if (accion === 'alternar') await ServicioCategorias.alternar(c);
    }
    await dibujar();
  });
}
export async function dibujar() { categorias = await ServicioCategorias.listar(); pintar(); }
function pintar() {
  $('sel_cat').innerHTML = selector(ServicioCategorias.opciones(categorias), vista);
  const lista = ServicioCategorias.filtrar(categorias, { vista, busqueda });
  $('tcat').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Categoría</th><th>Estado</th><th></th></tr>' + lista.map(c => `<tr><td class="codigo">${escapar(c.codigo)}</td><td><b>${escapar(c.nombre)}</b></td><td>${etiqueta(c.activo ? 'activo' : 'inactivo')}</td>
    <td class="acciones"><button class="chico secundario" data-accion="renombrar" data-id="${c.id}">Renombrar</button> <button class="chico peligro" data-accion="alternar" data-id="${c.id}">${c.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('') + '</table>' : '<p class="vacio">No hay categorías en esta vista.</p>';
}
