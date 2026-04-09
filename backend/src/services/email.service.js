const nodemailer = require('nodemailer');

// ── Configuración del transporter ─────────────────────────────────────────────
// Se inicializa una sola vez y se reutiliza en toda la app
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // contraseña de aplicación de Google (16 caracteres)
    },
  });

  return transporter;
}

// ── Función base de envío ─────────────────────────────────────────────────────
async function enviarEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  EMAIL_USER o EMAIL_PASS no configurados — email no enviado');
    return false;
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"GerenciAndo Canales" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✉️  Email enviado a ${to} — ID: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Error al enviar email a ${to}:`, err.message);
    return false;
  }
}

// ── Plantilla base HTML ───────────────────────────────────────────────────────
function plantillaBase({ titulo, subtitulo, cuerpo, color = '#7c3aad', emoji = '📋' }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f8;padding:40px 20px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#2d1b4e,${color});border-radius:16px 16px 0 0;padding:32px 36px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">${emoji}</div>
          <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:6px;">GerenciAndo Canales</div>
          <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.2;">${titulo}</div>
          ${subtitulo ? `<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;">${subtitulo}</div>` : ''}
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#ffffff;padding:32px 36px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          ${cuerpo}
          <!-- FOOTER -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #f0e8ff;text-align:center;">
            <div style="font-size:11px;color:#9d8bbf;">Este es un mensaje automático del sistema de licencias.</div>
            <div style="font-size:11px;color:#9d8bbf;margin-top:4px;">Por favor no respondas este correo.</div>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Componentes reutilizables de HTML ─────────────────────────────────────────
function infoRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 0;font-size:13px;color:#7a6896;font-weight:500;width:140px;">${label}</td>
      <td style="padding:10px 0;font-size:13px;color:#2d1b4e;font-weight:600;">${value}</td>
    </tr>`;
}

function infoTable(rows) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5ff;border-radius:10px;padding:4px 16px;margin:20px 0;">
      ${rows.map(([l, v]) => infoRow(l, v)).join('')}
    </table>`;
}

function tipoLabel(tipo) {
  return { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', LICENCIA_MEDICA: 'Licencia médica', AUSENCIA: 'Ausencia' }[tipo] || tipo;
}

function fmtFecha(f) {
  return new Date(f).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ── EMAILS ESPECÍFICOS ────────────────────────────────────────────────────────

/**
 * Email al empleado cuando su licencia fue APROBADA
 */
async function emailLicenciaAprobada({ empleado, licencia }) {
  const html = plantillaBase({
    titulo: '¡Tu licencia fue aprobada!',
    subtitulo: `Hola ${empleado.nombre}, tenés buenas noticias`,
    emoji: '✅',
    color: '#059669',
    cuerpo: `
      <p style="font-size:15px;color:#2d1b4e;margin:0 0 6px;">Hola <strong>${empleado.nombre}</strong>,</p>
      <p style="font-size:14px;color:#4b3d6e;line-height:1.6;margin:0 0 20px;">
        Tu solicitud de licencia fue <strong style="color:#059669;">aprobada</strong> por el equipo de RRHH.
      </p>
      ${infoTable([
        ['Tipo', tipoLabel(licencia.tipo)],
        ['Desde', fmtFecha(licencia.fechaInicio)],
        ['Hasta', fmtFecha(licencia.fechaFin)],
        ['Días hábiles', `${licencia.diasHabiles} días`],
        licencia.observaciones ? ['Observaciones', licencia.observaciones] : null,
      ].filter(Boolean))}
      <p style="font-size:13px;color:#7a6896;line-height:1.6;">
        Recordá firmar tu conformidad en el sistema cuando hayas gozado la licencia.
        Ante cualquier consulta, comunicate con RRHH.
      </p>
    `,
  });

  return enviarEmail({
    to: empleado.email,
    subject: `✅ Licencia aprobada — ${tipoLabel(licencia.tipo)} del ${fmtFecha(licencia.fechaInicio)}`,
    html,
  });
}

/**
 * Email al empleado cuando su licencia fue RECHAZADA
 */
async function emailLicenciaRechazada({ empleado, licencia, motivo }) {
  const html = plantillaBase({
    titulo: 'Tu licencia no pudo aprobarse',
    subtitulo: `Hola ${empleado.nombre}, te informamos sobre tu solicitud`,
    emoji: '❌',
    color: '#dc2626',
    cuerpo: `
      <p style="font-size:15px;color:#2d1b4e;margin:0 0 6px;">Hola <strong>${empleado.nombre}</strong>,</p>
      <p style="font-size:14px;color:#4b3d6e;line-height:1.6;margin:0 0 20px;">
        Lamentablemente tu solicitud de licencia fue <strong style="color:#dc2626;">rechazada</strong>.
      </p>
      ${infoTable([
        ['Tipo', tipoLabel(licencia.tipo)],
        ['Fechas solicitadas', `${fmtFecha(licencia.fechaInicio)} al ${fmtFecha(licencia.fechaFin)}`],
        motivo ? ['Motivo', motivo] : null,
      ].filter(Boolean))}
      <p style="font-size:13px;color:#7a6896;line-height:1.6;">
        Si tenés dudas o querés reprogramar la solicitud, comunicate con RRHH.
      </p>
    `,
  });

  return enviarEmail({
    to: empleado.email,
    subject: `❌ Licencia no aprobada — ${tipoLabel(licencia.tipo)}`,
    html,
  });
}

/**
 * Email al admin cuando un empleado hace una nueva solicitud
 */
async function emailNuevaSolicitud({ adminEmail, empleado, licencia }) {
  const html = plantillaBase({
    titulo: 'Nueva solicitud de licencia',
    subtitulo: 'Requiere tu aprobación',
    emoji: '📋',
    color: '#7c3aad',
    cuerpo: `
      <p style="font-size:14px;color:#4b3d6e;line-height:1.6;margin:0 0 20px;">
        <strong>${empleado.nombre} ${empleado.apellido}</strong> del área <strong>${empleado.area}</strong>
        realizó una nueva solicitud de licencia que requiere aprobación.
      </p>
      ${infoTable([
        ['Empleado', `${empleado.nombre} ${empleado.apellido}`],
        ['Área', empleado.area],
        ['Tipo', tipoLabel(licencia.tipo)],
        ['Desde', fmtFecha(licencia.fechaInicio)],
        ['Hasta', fmtFecha(licencia.fechaFin)],
        ['Días hábiles', `${licencia.diasHabiles} días`],
        licencia.observaciones ? ['Observaciones', licencia.observaciones] : null,
      ].filter(Boolean))}
      <p style="font-size:13px;color:#7a6896;">
        Ingresá al sistema para aprobar o rechazar esta solicitud.
      </p>
    `,
  });

  return enviarEmail({
    to: adminEmail,
    subject: `📋 Nueva solicitud: ${empleado.nombre} ${empleado.apellido} — ${tipoLabel(licencia.tipo)}`,
    html,
  });
}

/**
 * Email al empleado cuando la licencia fue firmada (cumplida)
 */
async function emailLicenciaFirmada({ empleado, licencia }) {
  const html = plantillaBase({
    titulo: 'Licencia registrada y firmada',
    subtitulo: 'Todo en orden con tu documentación',
    emoji: '✍️',
    color: '#0891b2',
    cuerpo: `
      <p style="font-size:15px;color:#2d1b4e;margin:0 0 6px;">Hola <strong>${empleado.nombre}</strong>,</p>
      <p style="font-size:14px;color:#4b3d6e;line-height:1.6;margin:0 0 20px;">
        Tu licencia fue <strong style="color:#0891b2;">registrada y firmada</strong> correctamente en el sistema.
      </p>
      ${infoTable([
        ['Tipo', tipoLabel(licencia.tipo)],
        ['Período', `${fmtFecha(licencia.fechaInicio)} al ${fmtFecha(licencia.fechaFin)}`],
        ['Días gozados', `${licencia.diasHabiles} días hábiles`],
      ])}
      <p style="font-size:13px;color:#7a6896;line-height:1.6;">
        Podés consultar tu historial completo y saldo de días disponibles en el sistema en cualquier momento.
      </p>
    `,
  });

  return enviarEmail({
    to: empleado.email,
    subject: `✍️ Licencia firmada — ${tipoLabel(licencia.tipo)}`,
    html,
  });
}



/**
 * Email de recuperación de contraseña
 */
async function emailRecuperarPassword({ email, nombre, resetUrl }) {
  const html = plantillaBase({
    titulo: 'Recuperar contraseña',
    subtitulo: 'Recibiste este email porque solicitaste un cambio de contraseña',
    emoji: '🔑',
    color: '#0891b2',
    cuerpo: `
      <p style="font-size:15px;color:#2d1b4e;margin:0 0 6px;">Hola <strong>${nombre || 'usuario'}</strong>,</p>
      <p style="font-size:14px;color:#4b3d6e;line-height:1.6;margin:0 0 20px;">
        Hacé clic en el botón para elegir una nueva contraseña. El link es válido por <strong>1 hora</strong>.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#7c3aad,#b344e0);color:white;text-decoration:none;border-radius:10px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600">
          Cambiar contraseña
        </a>
      </div>
      <p style="font-size:12px;color:#9d8bbf;text-align:center">
        Si no solicitaste este cambio, ignorá este email. Tu contraseña no cambiará.
      </p>
    `,
  });

  return enviarEmail({
    to: email,
    subject: '🔑 Recuperar contraseña — GerenciAndo Canales',
    html,
  });
}

module.exports = {
  emailLicenciaAprobada,
  emailLicenciaRechazada,
  emailNuevaSolicitud,
  emailLicenciaFirmada,
  emailRecuperarPassword,
};