# Panadería Guadalupe — arquitectura en capas

base_de_datos/        Persistencia y seguridad (PostgreSQL en Supabase)
  esquema.sql           Instalación nueva (tablas, RLS, funciones)
  migracion_empleados.sql           Migración 1 (usuarios y empleados)
  migracion_correo_y_desactivar.sql Migración 2 (correo, clientes activos, sin borrados)
  migracion_categorias.sql          Migración 3 (tabla de categorías)
  migracion_codigos.sql             Migración 4 (códigos únicos PRO-/CAT-/CLI-/EMP-/VEN-)
  migracion_filtros.sql             Migración 5 (productos más vendidos)
  migracion_panel.sql               Migración 6 (gráficos y reportes del panel)
  migracion_caja_costos.sql         Migración 7 (caja, pagos mixtos y deuda, proveedores, compras, costos, historial de stock, comprobante)
  migracion_datos_unicos.sql        Migración 8 (el stock y el costo solo cambian por compras, ventas y ajustes; ejecutarla también en instalaciones nuevas, después de esquema.sql)
  migracion_delivery.sql            Migración 9 (delivery: costo de envío, en camino, repartidor asignado, quién entregó y cuándo, historial de repartos; ejecutarla también en instalaciones nuevas)
  migracion_roles_seguros.sql       Migración 10 (las funciones de caja y cobros rechazan a empleados desactivados)
  migracion_contra_entrega.sql      Migración 11 (cobro contra entrega: el delivery cobra la venta en efectivo y recién ahí cuenta como venta; ejecutarla después de la 9, también en instalaciones nuevas)
  funcion_empleados.ts  Función de Supabase: login por usuario, crear cuentas y cambiar contraseñas
js/datos/             Capa de datos: repositorios. ÚNICA capa que habla con Supabase
js/negocio/           Capa de negocio: reglas, validaciones, permisos por rol
js/presentacion/      Capa de presentación: vistas del DOM; solo llaman a la capa de negocio
js/principal.js       Raíz de composición
js/configuracion.js   URL, clave pública y correo base
img/logo.png          Logo

Librerías externas (versiones fijas, se cargan solo al usarlas): Chart.js (gráficos), jsPDF + autotable (PDF) y SheetJS (Excel).

Regla: presentacion -> negocio -> datos -> base_de_datos

Origen de cada dato (nada se escribe por dos caminos):
  stock    entra con una compra, sale con las ventas, y se corrige con un ajuste (con motivo, queda en el historial)
  costo    lo calculan las compras (costo promedio); no se edita a mano
  precio, nombre, categoría, unidad, stock mínimo y estado: se editan en Productos

Probar local (los módulos ES no funcionan con doble clic):  python -m http.server 8000  y abrir http://localhost:8000
Publicar: subir a GitHub e importar en Vercel (sitio estático, sin configuración).
