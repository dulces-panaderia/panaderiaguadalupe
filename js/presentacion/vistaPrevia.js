// Ventana de vista previa: se dibuja dentro de la propia aplicación (no depende del diálogo de impresión del navegador).
// Muestra el contenido y, recién ahí, ofrece las acciones (descargar, imprimir, cerrar).
import { escapar, protegido } from './utilidades.js';
import { porcentaje, fechaCorta } from '../negocio/formato.js';
import { celda, GRUPOS } from './exportador.js';
let capa = null;
const alTeclear = e => { if (e.key === 'Escape') cerrarVistaPrevia(); };
export function cerrarVistaPrevia() {
  if (!capa) return;
  capa.remove(); capa = null; document.body.style.overflow = ''; document.removeEventListener('keydown', alTeclear);
}
// acciones: [{ texto, clase?, alHacerClic }]. El botón "Cerrar" se agrega solo.
export function abrirVistaPrevia({ titulo, html, acciones = [] }) {
  cerrarVistaPrevia();
  capa = document.createElement('div'); capa.id = 'previa'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-label', titulo);
  capa.innerHTML = `<div class="previa-caja"><div class="previa-cab"><h3>${escapar(titulo)}</h3><div class="previa-acciones"></div></div><div class="previa-cuerpo">${html}</div></div>`;
  const zona = capa.querySelector('.previa-acciones');
  [...acciones, { texto: 'Cerrar', clase: 'secundario', alHacerClic: cerrarVistaPrevia }].forEach(a => {
    const b = document.createElement('button'); b.textContent = a.texto; b.className = 'chico ' + (a.clase || '');
    b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await protegido(a.alHacerClic)(); } finally { b.disabled = false; } };   // deshabilitado mientras trabaja: un doble clic no descarga dos veces
    zona.appendChild(b);
  });
  capa.addEventListener('mousedown', e => { if (e.target === capa) cerrarVistaPrevia(); });
  document.addEventListener('keydown', alTeclear); document.body.appendChild(capa); document.body.style.overflow = 'hidden';
}

// Reporte de ventas tal como va a salir en el PDF (indicadores, gráficos, interpretación) más las tablas de detalle (las hojas del Excel)
export function htmlReporte(inf, imgs = {}) {
  const kpis = inf.kpis.map(k => `<tr><td>${escapar(k.etiqueta)}</td><td class="num">${escapar(celda(k.valor, k.tipo))}</td><td class="num">${escapar(celda(k.anterior, k.tipo))}</td>
    <td class="num">${k.variacion == null ? '-' : escapar((k.variacion > 0 ? '+' : '') + porcentaje(k.variacion, 1))}</td></tr>`).join('');
  const grupos = GRUPOS.map(([clave, texto, grafico]) => {
    const img = grafico && imgs[grafico], lista = inf.explicaciones[clave] || [];
    return `<h3>${escapar(texto)}</h3>${img ? `<img class="grafico-previa" src="${img.url}" alt="${escapar(texto)}">` : ''}`
      + (lista.length ? `<ul class="explicacion">${lista.map(m => `<li class="${escapar(m.nivel)}">${escapar(m.texto)}</li>`).join('')}</ul>` : '<p class="vacio">Sin observaciones.</p>');
  }).join('');
  const tablas = inf.tablas.map(t => `<h3>Detalle: ${escapar(t.nombre)}</h3><div class="zona-tabla"><table><tr>${t.columnas.map(c => `<th${c.tipo === 'texto' ? '' : ' class="num"'}>${escapar(c.texto)}</th>`).join('')}</tr>`
    + t.filas.map(f => `<tr>${f.map((v, i) => `<td${t.columnas[i].tipo === 'texto' ? '' : ' class="num"'}>${escapar(celda(v, t.columnas[i].tipo))}</td>`).join('')}</tr>`).join('') + '</table></div>').join('');
  return `<p class="pista">Así va a quedar el reporte. El PDF incluye todo lo que ves; el Excel trae el resumen y una hoja por cada tabla de detalle.</p>
  <div class="informe"><div class="informe-cab"><img src="img/logo.png" alt=""><div><h2>Panadería Guadalupe</h2><p>${escapar(inf.titulo)}</p><p><small>${escapar(inf.subtitulo)} · Generado el ${fechaCorta(new Date())}</small></p></div></div>
  <h3>Indicadores</h3><div class="zona-tabla"><table><tr><th>Indicador</th><th class="num">Período actual</th><th class="num">Período anterior</th><th class="num">Variación</th></tr>${kpis}</table></div>${grupos}${tablas}</div>`;
}
