import { $, escapar, mostrarMensaje, delegar, protegido, etiqueta, editarEnLinea, limpiar, selector } from './utilidades.js';
import { ServicioEmpleados, ROLES } from '../negocio/servicioEmpleados.js';
import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
import { ServicioEntregas, PERIODOS_REPARTOS } from '../negocio/servicioEntregas.js';
import { htmlResumenRepartos, htmlTablaRepartos } from './repartos.js';
let lista = [], vista = 'todos', busqueda = '', abierto = null, periodo = 'hoy';   // abierto: repartidor cuyo historial de repartos se está viendo
export function iniciar() {
  $('bus_emp').addEventListener('input', () => { busqueda = $('bus_emp').value; pintar(); });
  delegar($('s_emp'), async (accion, d, boton) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'repartos') { abierto = d.id; periodo = 'hoy'; await pintarRepartos(); $('detalle_emp').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (accion === 'cerrar_repartos') { abierto = null; await pintarRepartos(); return; }
    if (accion === 'periodo_rep') { periodo = d.vista; await pintarRepartos(); return; }
    if (accion === 'crear') {
      await ServicioEmpleados.crear({ nombre: $('en').value, usuario: $('eu').value, correo: $('eco').value, rol: $('er').value, clave: $('ec').value });
      limpiar('en', 'eu', 'eco', 'er', 'ec'); mostrarMensaje('Empleado creado');
    } else {
      const e = lista.find(x => x.id === d.id), celda = boton.closest('td');
      if (accion === 'nombre') return editarEnLinea(celda, { valor: e.nombre, alCancelar: pintar,
        alGuardar: async v => { await ServicioEmpleados.cambiarNombre(e, v); mostrarMensaje('Nombre actualizado'); await dibujar(); } });
      if (accion === 'usuario') return editarEnLinea(celda, { valor: e.usuario, alCancelar: pintar,
        alGuardar: async v => { await ServicioEmpleados.cambiarUsuario(e, v); mostrarMensaje('Usuario actualizado'); await dibujar(); } });
      if (accion === 'clave') return editarEnLinea(celda, { tipo: 'password', placeholder: 'Nueva contraseña (mín. 6)', alCancelar: pintar,
        alGuardar: async v => { await ServicioEmpleados.cambiarClave(e, v); mostrarMensaje('Contraseña actualizada'); await dibujar(); } });
      if (accion === 'activo') await ServicioEmpleados.alternarActivo(e);
    }
    await dibujar();
  });
  $('temp').addEventListener('change', protegido(async ev => {
    try { await ServicioEmpleados.cambiarRol(lista.find(x => x.id === ev.target.dataset.id), ev.target.value); mostrarMensaje('Rol actualizado'); await dibujar(); }
    catch (err) { pintar(); throw err; }
  }));
}
export async function dibujar() { lista = await ServicioEmpleados.listar(); pintar(); await pintarRepartos(); }
function pintar() {
  const yo = ServicioAutenticacion.usuario()?.id, ops = ServicioEmpleados.opciones(lista);
  if (!ops.some(o => o.id === vista)) vista = 'todos';
  $('sel_emp').innerHTML = selector(ops, vista);
  const filas = ServicioEmpleados.filtrar(lista, { vista, busqueda });
  $('temp').innerHTML = filas.length ? '<table><tr><th>Código</th><th>Empleado</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr>' + filas.map(e => {
    const roles = e.rol === 'pendiente' ? ['pendiente', ...ROLES] : ROLES;
    return `<tr><td class="codigo">${escapar(e.codigo)}</td><td><b>${escapar(e.nombre)}</b>${e.id === yo ? ' <small>(vos)</small>' : ''}<br><small>${escapar(e.correo || 'Sin correo')}</small></td><td>${escapar(e.usuario || '')}</td>
    <td><select data-id="${e.id}">${roles.map(r => `<option ${r === e.rol ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
    <td>${etiqueta(e.activo ? 'activo' : 'inactivo')}</td>
    <td class="acciones">${e.rol === 'repartidor' ? `<button class="chico" data-accion="repartos" data-id="${e.id}">Repartos</button> ` : ''}<button class="chico secundario" data-accion="nombre" data-id="${e.id}">Nombre</button> <button class="chico secundario" data-accion="usuario" data-id="${e.id}">Usuario</button> <button class="chico secundario" data-accion="clave" data-id="${e.id}">Contraseña</button>
    ${e.id === yo ? '' : `<button class="chico peligro" data-accion="activo" data-id="${e.id}">${e.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`;
  }).join('') + '</table>' : '<p class="vacio">No hay empleados en esta vista.</p>';
}
// Historial de repartos de un repartidor (solo lo ve el admin): cuántos entregó, cuándo, a quién y cuánto tardó
async function pintarRepartos() {
  const cont = $('detalle_emp'), e = lista.find(x => x.id === abierto);
  cont.style.display = e ? '' : 'none'; if (!e) return;
  const filas = await ServicioEntregas.historial(periodo, e.id);
  cont.innerHTML = `<div class="entrega-cab"><h3>Repartos de ${escapar(e.nombre)} <small>${escapar(e.codigo)}</small></h3><button class="chico secundario" data-accion="cerrar_repartos">Cerrar</button></div>
  <div class="barra"><div class="selector">${selector(PERIODOS_REPARTOS, periodo, 'periodo_rep')}</div></div>
  <div class="indicadores">${htmlResumenRepartos(ServicioEntregas.resumen(filas))}</div><div class="zona-tabla tabla-repartos">${htmlTablaRepartos(filas)}</div>`;
}
