import { RepositorioPanel } from '../datos/repositorioPanel.js';
import { RepositorioProductos } from '../datos/repositorioProductos.js';
import { RepositorioClientes } from '../datos/repositorioClientes.js';
import { calcularPeriodo, construirContexto, construirInforme, PERIODOS, PASOS } from './analisisVentas.js';
import { explicar } from './sistemaExperto.js';
export { PERIODOS, PASOS };
const traducir = e => { throw new Error(/function|schema cache/i.test(e.message) ? 'Faltan migraciones en Supabase: ejecutá base_de_datos/migracion_panel.sql y base_de_datos/migracion_caja_costos.sql.' : e.message); };
export const ServicioPanel = {
  periodo: calcularPeriodo,
  // Trae los datos del período (y del anterior de igual duración), los analiza y arma las explicaciones y el informe exportable
  async cargar(periodo, zona) {
    const d = periodo.desde.toISOString(), h = periodo.hasta.toISOString();
    try {
      const [resumen, resumenAnterior, serie, productos, calendario, catalogo, medios, saldos] = await Promise.all([
        RepositorioPanel.resumen(d, h), RepositorioPanel.resumen(periodo.anteriorDesde.toISOString(), periodo.anteriorHasta.toISOString()),
        RepositorioPanel.serie(d, h, periodo.paso, zona), RepositorioPanel.productos(d, h), RepositorioPanel.calendario(d, h, zona), RepositorioProductos.listar(),
        RepositorioPanel.medios(d, h), RepositorioClientes.saldos()]);
      const deudaClientes = saldos.reduce((s, x) => s + Math.max(0, Number(x.saldo)), 0);
      const ctx = construirContexto({ periodo, resumen, resumenAnterior, serie, productos, calendario, catalogo, medios, deudaClientes });
      const explicaciones = explicar(ctx);
      return { ctx, explicaciones, informe: construirInforme(ctx, explicaciones) };
    } catch (e) { traducir(e); }
  },
};
