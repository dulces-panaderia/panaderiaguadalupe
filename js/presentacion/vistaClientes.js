import { $, escapar, dinero, mostrarMensaje, delegar, etiqueta, limpiar, selector } from './utilidades.js';
import { ServicioClientes } from '../negocio/servicioClientes.js';
import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
let clientes = [], saldos = new Map(), vista = 'todos', busqueda = '', abierto = null;
const fecha = d => new Date(d).toLocaleString('es-AR');
export function iniciar() {
  $('bus_cli').addEventListener('input', () => { busqueda = $('bus_cli').value; pintar(); });
  delegar($('s_cli'), async (accion, d) => {
    if (accion === 'vista') { vista = d.vista; pintar(); return; }
    if (accion === 'guardar') {
      await ServicioClientes.crear({ nombre: $('cn').value, telefono: $('ct').value.trim(), direccion: $('cd').value.trim() });
      limpiar('cn', 'ct', 'cd'); mostrarMensaje('Cliente guardado');
    }
    if (accion === 'alternar') await ServicioClientes.alternar(clientes.find(x => x.id === +d.id));
    if (accion === 'cuenta') abierto = +d.id;
    if (accion === 'cerrar_cuenta') abierto = null;
    if (accion === 'cobrar') {
      const c = clientes.find(x => x.id === abierto);
      await ServicioClientes.cobrar(c, $('cb_monto').value, $('cb_medio').value, saldos.get(c.id) || 0, $('cb_nota').value); mostrarMensaje('Cobro registrado');
    }
    await dibujar();
  });
}
export async function dibujar() { [clientes, saldos] = await Promise.all([ServicioClientes.listar(), ServicioClientes.saldos()]); pintar(); await pintarCuenta(); }
function pintar() {
  const admin = ServicioAutenticacion.esAdmin();
  $('sel_cli').innerHTML = selector(ServicioClientes.opciones(clientes, saldos), vista);
  const lista = ServicioClientes.filtrar(clientes, { vista, busqueda, saldos });
  $('tcli').innerHTML = lista.length ? '<table><tr><th>Código</th><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th class="num">Deuda</th><th>Estado</th><th></th></tr>' + lista.map(c => { const s = saldos.get(c.id) || 0;
    return `<tr><td class="codigo">${escapar(c.codigo)}</td><td><b>${escapar(c.nombre)}</b></td><td>${escapar(c.telefono || '')}</td><td>${escapar(c.direccion || '')}</td>
    <td class="num">${s > 0.005 ? `<span class="baja">${dinero(s)}</span>` : s < -0.005 ? `<span class="sube">${dinero(-s)} a favor</span>` : '<span class="tenue">—</span>'}</td><td>${etiqueta(c.activo ? 'activo' : 'inactivo')}</td>
    <td class="acciones"><button class="chico secundario" data-accion="cuenta" data-id="${c.id}">Cuenta</button>${admin ? ` <button class="chico peligro" data-accion="alternar" data-id="${c.id}">${c.activo ? 'Desactivar' : 'Activar'}</button>` : ''}</td></tr>`; }).join('') + '</table>' : '<p class="vacio">No hay clientes en esta vista.</p>';
}
// Cuenta corriente del cliente: ventas a deuda, cobros y saldo. Desde acá se cobra la deuda.
async function pintarCuenta() {
  const cont = $('detalle_cli'), c = clientes.find(x => x.id === abierto);
  cont.style.display = c ? '' : 'none'; if (!c) return;
  const [mov, saldo] = [await ServicioClientes.cuenta(c.id), saldos.get(c.id) || 0];
  cont.innerHTML = `<div class="entrega-cab"><h3>Cuenta de ${escapar(c.nombre)} <small>${escapar(c.codigo)}</small></h3><button class="chico secundario" data-accion="cerrar_cuenta">Cerrar</button></div>
  <p>Saldo actual: <b class="${saldo > 0.005 ? 'baja' : 'sube'}">${dinero(Math.abs(saldo))}</b> ${saldo > 0.005 ? '(el cliente debe)' : saldo < -0.005 ? '(a favor del cliente)' : '(sin deuda)'}</p>
  <div class="zona-tabla">${mov.length ? '<table><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="num">Movimiento</th><th class="num">Saldo</th></tr>' + mov.map(f => `<tr><td>${fecha(f.fecha)}</td><td>${escapar(f.detalle)}</td><td>${escapar(f.tipo)}</td>
    <td class="num"><span class="${f.monto > 0 ? 'baja' : 'sube'}">${f.monto > 0 ? '+' : '-'}${dinero(Math.abs(f.monto))}</span></td><td class="num">${dinero(f.saldo)}</td></tr>`).join('') + '</table>' : '<p class="vacio">Este cliente todavía no tiene movimientos de cuenta.</p>'}</div>
  ${saldo > 0.005 ? `<div class="fila" style="margin-top:14px"><input id="cb_monto" inputmode="decimal" placeholder="Monto que paga" autocomplete="off"><select id="cb_medio"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select><input id="cb_nota" placeholder="Nota (opcional)" autocomplete="off"><button data-accion="cobrar">Cobrar</button></div><p class="pista">El cobro entra a la caja abierta.</p>` : ''}`;
}
