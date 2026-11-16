import { $, escapar, dinero, mostrarMensaje, delegar, etiqueta, confirmarEnLinea, selector } from './utilidades.js';
import { ServicioEntregas, PERIODOS_REPARTOS } from '../negocio/servicioEntregas.js';
import { ServicioAutenticacion } from '../negocio/servicioAutenticacion.js';
import { htmlResumenRepartos, htmlTablaRepartos } from './repartos.js';
let entregas = [], repartidores = [], periodo = 'hoy';
const mapa = d => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d || '')}`;
const hora = d => new Date(d).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
// Cada acción pide confirmación porque no se puede deshacer (y las que cobran, también el monto)
const ACCIONES = {
  entregar: { pregunta: () => '¿Confirmás que se entregó?', boton: 'Sí, entregada', hecho: 'Entrega registrada', ejecutar: id => ServicioEntregas.marcar(id, false) },
  entregar_sin_cobrar: { pregunta: () => '¿Se entregó sin cobrar? Va a quedar por cobrar.', boton: 'Sí, entregada sin cobrar', hecho: 'Entrega registrada, falta cobrar', ejecutar: id => ServicioEntregas.marcar(id, false) },
  entregar_cobrada: { pregunta: (p, admin) => admin ? `¿Se entregó y el delivery cobró ${dinero(p.total)} en efectivo?` : `¿Entregaste y cobraste ${dinero(p.total)} en efectivo?`,
    boton: 'Sí, entregada y cobrada', hecho: 'Entrega y cobro registrados', ejecutar: id => ServicioEntregas.marcar(id, true) },
  cobrar: { pregunta: (p, admin) => admin ? `¿El delivery cobró ${dinero(p.total)} en efectivo?` : `¿Cobraste ${dinero(p.total)} en efectivo?`, boton: 'Sí, cobrada', hecho: 'Cobro registrado', ejecutar: id => ServicioEntregas.cobrar(id) },
};
export function iniciar() {
  delegar($('s_entregas'), async (accion, d, boton) => {
    if (accion === 'periodo') { periodo = d.vista; await pintarRepartos(); return; }
    const a = ACCIONES[accion];
    if (a) {
      const p = entregas.find(x => x.id === +d.id);
      confirmarEnLinea(boton.closest('.entrega-acciones'), a.pregunta(p, ServicioAutenticacion.esAdmin()), { textoBoton: a.boton, alCancelar: pintarPedidos,
        alConfirmar: async () => { await a.ejecutar(+d.id); mostrarMensaje(a.hecho); await dibujar(); } });
      return;
    }
    if (accion === 'tomar') { await ServicioEntregas.tomar(+d.id); mostrarMensaje('Saliste a repartir el pedido'); }
    if (accion === 'asignar') { await ServicioEntregas.asignar(+d.id, boton.closest('.entrega-acciones').querySelector('select').value); mostrarMensaje('Repartidor actualizado'); }
    await dibujar();
  });
}
export async function dibujar() {
  const admin = ServicioAutenticacion.esAdmin(), esRepartidor = ServicioAutenticacion.usuario()?.rol === 'repartidor';
  [entregas, repartidores] = await Promise.all([ServicioEntregas.listar(), admin ? ServicioEntregas.repartidores() : []]);
  pintarPedidos();
  $('mis_repartos').style.display = esRepartidor ? '' : 'none';
  if (esRepartidor) await pintarRepartos();
}
function pintarPedidos() {
  const yo = ServicioAutenticacion.usuario()?.id, admin = ServicioAutenticacion.esAdmin();
  $('tent').innerHTML = entregas.map(e => tarjeta(e, yo, admin)).join('') || '<p class="vacio">No hay entregas pendientes.</p>';
}
function tarjeta(e, yo, admin) {
  const c = ServicioEntregas.cobro(e), enCamino = e.estado === 'en_camino', entregada = e.estado === 'entregada', propio = e.repartidor_id === yo;
  const contra = !!e.contra_entrega, porCobrar = ServicioEntregas.porCobrar(e), hayEnvio = Number(e.costo_envio) > 0;
  const reparto = admin ? `${e.repartidor ? escapar(e.repartidor) : '<span class="tenue">Sin asignar</span>'}${enCamino && e.en_camino_en ? ` · salió a las ${hora(e.en_camino_en)}` : ''}${entregada && e.entregada_en ? ` · entregó a las ${hora(e.entregada_en)}` : ''}`
    : entregada ? `Entregado a las ${e.entregada_en ? hora(e.entregada_en) : '—'}` : enCamino ? `En camino, salió a las ${e.en_camino_en ? hora(e.en_camino_en) : '—'}` : propio ? 'Asignado a vos' : 'Disponible para tomar';
  // El admin puede elegir al repartidor (si el asignado fue desactivado, igual aparece)
  const opciones = [...repartidores]; if (e.repartidor_id && !opciones.some(r => r.id === e.repartidor_id)) opciones.push({ id: e.repartidor_id, nombre: e.repartidor });
  const asignar = admin && !entregada ? `<select><option value="">Sin asignar</option>${opciones.map(r => `<option value="${r.id}" ${r.id === e.repartidor_id ? 'selected' : ''}>${escapar(r.nombre)}</option>`).join('')}</select><button class="chico secundario" data-accion="asignar" data-id="${e.id}">Asignar</button>` : '';
  const t = admin ? 'chico ' : '';   // el repartidor usa botones grandes (se usan en la calle)
  const boton = (accion, texto, clase = '') => `<button class="${t}${clase}" data-accion="${accion}" data-id="${e.id}">${texto}</button>`;
  const acciones = asignar + (entregada ? boton('cobrar', `Marcar cobrada ${dinero(e.total)}`)
    : porCobrar ? `${admin || enCamino ? '' : boton('tomar', 'Salir a repartir')}${boton('entregar_cobrada', 'Entregada y cobrada', admin || !enCamino ? 'secundario' : '')}${boton('entregar_sin_cobrar', 'Entregada sin cobrar', 'secundario')}`
    : `${admin || enCamino ? '' : boton('tomar', 'Salir a repartir')}${boton('entregar', 'Marcar entregada', enCamino && !admin ? '' : 'secundario')}`);
  // Lo más importante para el delivery: si tiene que cobrar o el pedido ya está pagado
  const cobro = contra ? (porCobrar ? `<dt>Cobrar</dt><dd>${admin ? `Contra entrega: ${dinero(e.total)} en efectivo` : `<b class="cobrar">Cobrá ${dinero(e.total)} en efectivo</b> al entregar`}${hayEnvio ? ` <small>(incluye envío ${dinero(e.costo_envio)})</small>` : ''}</dd>`
      : '<dt>Cobro</dt><dd><span class="sube">Cobrado en efectivo</span></dd>')
    : `<dt>Pago</dt><dd>${c.cobrado.map(p => `${escapar(p.texto)} ${dinero(p.monto)}`).join(' · ') || '—'}${c.aCuenta > 0 ? `<br><span class="baja">A cuenta (el cliente debe): ${dinero(c.aCuenta)}</span>` : '<br><small>Pagado por completo</small>'}</dd>`;
  const etiquetaCobro = contra ? (porCobrar ? etiqueta('cobrar al entregar', 'pendiente') : etiqueta('cobrado', 'completada')) : etiqueta('pagado', 'completada');
  return `<div class="caja"><div class="entrega-cab"><b>Pedido ${escapar(e.codigo || '#' + e.id)}</b><span>${etiquetaCobro} ${etiqueta(enCamino ? 'en camino' : e.estado, e.estado)}</span></div>
    <dl><dt>Reparto</dt><dd>${reparto}</dd><dt>Cliente</dt><dd>${escapar(e.cliente || 'Cliente general')}</dd>
    <dt>Dirección</dt><dd><a href="${mapa(e.direccion)}" target="_blank" rel="noopener">${escapar(e.direccion || 'Sin dirección')}</a></dd>
    ${e.telefono ? `<dt>Teléfono</dt><dd><a href="tel:${escapar(e.telefono)}">${escapar(e.telefono)}</a></dd>` : ''}
    <dt>Detalle</dt><dd>${escapar(e.detalle)}</dd>${cobro}
    <dt>Total</dt><dd><b>${dinero(e.total)}</b>${hayEnvio && !porCobrar ? ` <small>(incluye envío ${dinero(e.costo_envio)})</small>` : ''}</dd></dl>
    <div class="entrega-acciones">${acciones}</div></div>`;
}
// Historial del repartidor: solo sus entregas (la base de datos nunca le devuelve las de otros)
async function pintarRepartos() {
  $('sel_repartos').innerHTML = selector(PERIODOS_REPARTOS, periodo, 'periodo');
  const filas = await ServicioEntregas.historial(periodo);
  $('resumen_repartos').innerHTML = htmlResumenRepartos(ServicioEntregas.resumen(filas));
  $('trepartos').innerHTML = htmlTablaRepartos(filas);
}
