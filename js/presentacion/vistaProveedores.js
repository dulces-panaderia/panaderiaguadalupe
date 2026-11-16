import { $, escapar, dinero, mostrarMensaje, delegar, etiqueta, limpiar, selector } from './utilidades.js';
import { ServicioProveedores } from '../negocio/servicioProveedores.js';
import { ServicioCompras } from '../negocio/servicioCompras.js';
let proveedores = [], deudas = new Map(), vista = 'todos', busqueda = '';
export function iniciar() {
  $('bus_prov').addEventListener('input', () => { busqueda = $('bus_prov').value; pintar(); });
  delegar($('s_prov'), async (accion, d) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'guardar') {
      await ServicioProveedores.crear({ nombre: $('vn').value, telefono: $('vt').value, correo: $('vc').value, direccion: $('vd').value, notas: $('vo').value });
      limpiar('vn', 'vt', 'vc', 'vd', 'vo'); mostrarMensaje('Proveedor guardado');
    }
    if (accion === 'alternar') await ServicioProveedores.alternar(proveedores.find(x => x.id === +d.id));
    await dibujar();
  });
}
export async function dibujar() {
  [proveedores, deudas] = await Promise.all([ServicioProveedores.listar(), ServicioCompras.listar().then(c => ServicioCompras.deudaPorProveedor(c))]); pintar();
}
function pintar() {
  $('sel_prov').innerHTML = selector(ServicioProveedores.opciones(proveedores), vista);
  const lista = ServicioProveedores.filtrar(proveedores, { vista, busqueda });
  $('tprov').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Proveedor</th><th>Contacto</th><th>Dirección</th><th class="num">Le debemos</th><th>Estado</th><th></th></tr>' + lista.map(p => {
    const deuda = deudas.get(p.id) || 0;
    return `<tr><td class="codigo">${escapar(p.codigo)}</td><td><b>${escapar(p.nombre)}</b>${p.notas ? `<br><small>${escapar(p.notas)}</small>` : ''}</td><td>${escapar(p.telefono || '')}${p.correo ? `<br><small>${escapar(p.correo)}</small>` : ''}</td><td>${escapar(p.direccion || '')}</td>
    <td class="num">${deuda > 0.005 ? `<span class="baja">${dinero(deuda)}</span>` : '<span class="tenue">—</span>'}</td><td>${etiqueta(p.activo ? 'activo' : 'inactivo')}</td>
    <td class="acciones"><button class="chico peligro" data-accion="alternar" data-id="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`; }).join('') + '</table>' : '<p class="vacio">No hay proveedores en esta vista.</p>';
}
