/**
 * Envío de correos (códigos de acceso). Configurar en server/.env:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=cuenta@gmail.com
 *   SMTP_PASS=<contraseña de aplicación>  SMTP_FROM="ComercIA <cuenta@gmail.com>"
 * Sin SMTP configurado el correo se escribe en la consola del servidor (modo desarrollo).
 */
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;
let lastError: string | null = null;

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function mailStatus() {
  return { configured: mailConfigured(), lastError };
}

function transport(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (!mailConfigured()) {
    console.log(
      `\n──────── CORREO (SMTP no configurado: solo consola) ────────\nPara: ${to}\nAsunto: ${subject}\n\n${text}\n────────────────────────────────────────────────────────────\n`,
    );
    return;
  }
  try {
    await transport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    lastError = null;
  } catch (err) {
    lastError = (err as Error).message;
    console.error('[correo] Error enviando correo:', lastError);
    throw Object.assign(new Error('No se pudo enviar el correo. Intente de nuevo más tarde.'), { status: 502 });
  }
}

export function loginCodeEmail(name: string, code: string, minutes: number) {
  const subject = `${code} es tu código de acceso a ComercIA`;
  const text =
    `Hola ${name}:\n\nTu código para ingresar a ComercIA es: ${code}\n\n` +
    `Vence en ${minutes} minutos. Si no lo solicitaste, ignora este correo; nadie podrá entrar sin el código.\n`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
    <div style="font-size:20px;font-weight:bold;color:#2563eb">ComercIA</div>
    <p>Hola ${escapeHtml(name)}:</p>
    <p>Tu código para ingresar es:</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#eff6ff;border-radius:12px;padding:16px;text-align:center">${code}</div>
    <p style="color:#64748b;font-size:13px">Vence en ${minutes} minutos. Si no lo solicitaste, ignora este correo; nadie podrá entrar sin el código.</p>
  </div>`;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
