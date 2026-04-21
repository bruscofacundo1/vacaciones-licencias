Tengo dos versiones del frontend:

1. El frontend ACTUAL (dashboard.html, login.html, empleados.html, 
usuarios.html, reset-password.html) — tiene toda la lógica funcional 
conectada a la API en Railway, JWT, roles, firma digital, etc. 
Todo funciona en producción.

2. Un archivo de REFERENCIA DE DISEÑO llamado "carpeta-referencia" 
que tiene el estilo visual y la estructura que quiero usar como base.

Lo que necesito:
Tomá el archivo "carpeta-referencia" como base visual y de estructura.
Reescribí cada página del frontend PARTIENDO del diseño de referencia 
e inyectando dentro toda la lógica funcional del frontend actual.
Es decir: el resultado final debe verse y estructurarse como 
"diseño-referencia.html" pero funcionar como el frontend actual.

Específicamente mantené:
- Todas las llamadas a la API (const API = 'https://vacaciones-licencias-production.up.railway.app/api')
- El sistema de autenticación JWT (localStorage con token y usuario)
- Los roles ADMIN/EMPLEADO y sus vistas diferenciadas
- La firma digital con signature_pad
- La importación de Excel con SheetJS
- Todas las funciones: aprobar, rechazar, firmar, sincronizar feriados, 
  vista calendario de feriados, cambiar contraseña, recuperar contraseña,
  filtros por área, búsqueda de empleados, exportar CSV, modal nueva licencia,
  cálculo de días hábiles excluyendo feriados y domingos
- El sidebar con navegación a: Dashboard, Empleados, Usuarios, Licencias, Feriados
- La lógica de saldo multi-año (diasAsignados, diasTomados, saldoTotal, saldoAnterior)

Empezá por login.html, luego dashboard.html, luego empleados.html, 
luego usuarios.html y por último reset-password.html.
Hacé uno por vez y esperá mi confirmación antes de seguir con el siguiente.