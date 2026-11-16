import { $, escapar, dinero, mostrarMensaje, delegar, selector } from './utilidades.js';
import { ServicioPanel, PERIODOS, PASOS } from '../negocio/servicioPanel.js';
import { porcentaje } from '../negocio/formato.js';
import { dibujarGraficos, imagenes } from './graficos.js';
import { exportarPDF, exportarExcel } from './exportador.js';
import { abrirVistaPrevia, htmlReporte } from './vistaPrevia.js';
let periodoId = '30d', paso = 'auto', actual = null, version = 0;
const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;   // las ventas se agrupan según la hora local del navegador
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const NOMBRE_PASO = { day: 'día', week: 'semana', month: 'mes' };
const EXPLICACIONES = [['resumen', 'exp_resumen'], ['evolucion', 'exp_evolucion'], ['productos', 'exp_productos'], ['ganancia', 'exp_ganancia'], ['medios', 'exp_medios'], ['categorias', 'exp_categorias'], ['dias', 'exp_dias'], ['horas', 'exp_horas']];

export function iniciar() {
  const hoy = new Date(); $('rg_hasta').value = iso(hoy); $('rg_desde').value = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29));
  delegar($('s_dash'), async (accion, d) => {
    if (accion === 'periodo') { periodoId = d.vista; $('rango').style.display = periodoId === 'personalizado' ? '' : 'none'; await cargar(); }
    if (accion === 'paso') { paso = d.vista; await cargar(); }
    if (accion === 'aplicar') await cargar();
    if (accion === 'previa') {   // primero se ve el reporte; recién ahí se elige descargar el PDF o el Excel
      if (!actual) throw new Error('Todavía no hay datos para el reporte');
      const inf = actual.informe, imgs = imagenes();
      abrirVistaPrevia({ titulo: 'Vista previa del reporte', html: htmlReporte(inf, imgs), acciones: [
        { texto: 'Descargar PDF', alHacerClic: async () => { mostrarMensaje('Generando el PDF...'); await exportarPDF(inf, imgs); } },
        { texto: 'Descargar Excel', clase: 'secundario', alHacerClic: async () => { mostrarMensaje('Generando el Excel...'); await exportarExcel(inf); } }] });
    }
  });
}
export const dibujar = () => cargar();
function pintarSelectores() { $('sel_periodo').innerHTML = selector(PERIODOS, periodoId, 'periodo'); $('sel_paso').innerHTML = selector(PASOS, paso, 'paso'); }
async function cargar() {
  pintarSelectores(); const mia = ++version; $('pista_panel').textContent = 'Calculando...';
  let periodo; try { periodo = ServicioPanel.periodo(periodoId, { desde: $('rg_desde').value, hasta: $('rg_hasta').value }, paso); } catch (e) { $('pista_panel').textContent = ''; throw e; }
  let r; try { r = await ServicioPanel.cargar(periodo, zona); } catch (e) { $('pista_panel').textContent = ''; throw e; }
  if (mia !== version) return;   // llegó una consulta más nueva: se descarta esta
  actual = r; pintar(r);
  await dibujarGraficos(r.ctx);
}
function pintar({ ctx, explicaciones, informe }) {
  const p = ctx.periodo;
  $('pista_panel').textContent = `Mostrando ${p.etiqueta}  ·  agrupado por ${NOMBRE_PASO[p.paso]}  ·  comparado con el período anterior de igual duración (${p.etiquetaAnterior})`;
  $('kpis').innerHTML = informe.kpis.map(k => {
    const valor = k.tipo === 'dinero' ? dinero(k.valor) : k.tipo === 'porcentaje' ? porcentaje(k.valor, 0) : Number(k.valor).toLocaleString('es-AR');
    const var_ = k.variacion == null ? '' : `<span class="variacion ${k.variacion >= 0 ? 'sube' : 'baja'}">${k.variacion >= 0 ? '+' : ''}${porcentaje(k.variacion, 1)} vs. período anterior</span>`;
    return `<div class="caja"><small>${escapar(k.etiqueta)}</small><b>${valor}</b>${var_}</div>`; }).join('');
  EXPLICACIONES.forEach(([clave, id]) => { const l = explicaciones[clave];
    $(id).innerHTML = l.length ? l.map(m => `<li class="${m.nivel}">${escapar(m.texto)}<span class="regla">${m.regla}</span></li>`).join('') : '<li class="vacio">Sin observaciones para este gráfico.</li>'; });
}
