// Raíz de composición: conecta las vistas con la navegación
import * as Estructura from './presentacion/estructura.js';
import * as Venta from './presentacion/vistaVender.js';
import * as Producto from './presentacion/vistaProductos.js';
import * as Categoria from './presentacion/vistaCategorias.js';
import * as Caja from './presentacion/vistaCaja.js';
import * as Proveedores from './presentacion/vistaProveedores.js';
import * as Compras from './presentacion/vistaCompras.js';
import * as Movimientos from './presentacion/vistaMovimientos.js';
import * as Cliente from './presentacion/vistaClientes.js';
import * as Historial from './presentacion/vistaHistorial.js';
import * as Entrega from './presentacion/vistaEntregas.js';
import * as Dashboard from './presentacion/vistaPanel.js';
import * as Empleados from './presentacion/vistaEmpleados.js';
const vistas = { vender: Venta, caja: Caja, prod: Producto, cat: Categoria, comp: Compras, prov: Proveedores, mov: Movimientos, cli: Cliente, ventas: Historial, entregas: Entrega, dash: Dashboard, emp: Empleados, pend: { dibujar() {} } };
Object.entries(vistas).forEach(([n, v]) => { v.iniciar?.(); Estructura.registrar(n, v); });
Estructura.iniciar();
