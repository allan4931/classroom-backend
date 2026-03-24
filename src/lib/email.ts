/**
 * Email service using Nodemailer.
 * Gracefully falls back to console logging when SMTP is not configured
 * so the server never crashes in dev without email credentials.
 */
import nodemailer from "nodemailer";

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  // Fall back to Ethereal (logs to console) if SMTP not configured
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const FROM = process.env.SMTP_FROM ?? "NetClass <no-reply@netclass.app>";
const APP_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transporter = getTransporter();
  if (!transporter) {
    // Dev fallback — print to console so emails are visible without SMTP
    console.log(`\n📧 [EMAIL → ${opts.to}]\nSubject: ${opts.subject}\n${opts.text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, ...opts });
  } catch (e) {
    console.error("Email send failed:", e);
    // Never throw — email failure should not crash a request
  }
}

/* ── Templates ─────────────────────────────────────────────────────────── */

const baseHtml = (body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:Inter,sans-serif;background:#f9fafb;margin:0;padding:32px}
  .card{background:#fff;border-radius:12px;padding:32px;max-width:560px;margin:0 auto;border:1px solid #e5e7eb}
  .logo{font-size:22px;font-weight:800;color:#4f46e5;margin-bottom:24px}
  .logo span{color:#1e1b4b}
  h2{margin:0 0 12px;color:#111827;font-size:20px}
  p{color:#6b7280;line-height:1.6;margin:8px 0}
  .cred{background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0}
  .cred dt{font-size:11px;text-transform:uppercase;color:#9ca3af;font-weight:600;margin-bottom:2px}
  .cred dd{font-weight:600;color:#111827;margin:0 0 12px;font-family:monospace}
  .btn{display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px}
  .footer{text-align:center;color:#9ca3af;font-size:12px;margin-top:24px}
  .alert{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin:16px 0;color:#92400e;font-size:13px}
</style></head>
<body><div class="card">
  <div class="logo"><span>Net</span>Class</div>
  ${body}
  <div class="footer">© ${new Date().getFullYear()} NetClass · <a href="${APP_URL}" style="color:#4f46e5">Open Platform</a></div>
</div></body>
</html>`;

/** Welcome email sent after account is approved / first admin registers */
export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  role: string;
  temporaryPassword?: string;
}) {
  const credBlock = opts.temporaryPassword
    ? `<div class="cred">
        <dt>Email</dt><dd>${opts.to}</dd>
        <dt>Temporary Password</dt><dd>${opts.temporaryPassword}</dd>
       </div>
       <p>Please change your password after your first login.</p>`
    : `<p>You can now log in with the email and password you chose during registration.</p>`;

  const html = baseHtml(`
    <h2>Welcome to NetClass, ${opts.name}! 🎓</h2>
    <p>Your <strong>${opts.role}</strong> account has been approved and is now active.</p>
    ${credBlock}
    <a class="btn" href="${APP_URL}/login">Log In Now</a>
  `);

  await sendMail({
    to: opts.to,
    subject: `Welcome to NetClass — Your account is ready, ${opts.name}`,
    html,
    text: `Welcome to NetClass, ${opts.name}! Your ${opts.role} account is now active. Log in at ${APP_URL}/login`,
  });
}

/** Login notification email with IP and device info */
export async function sendLoginNotificationEmail(opts: {
  to: string;
  name: string;
  ip: string;
  userAgent: string;
  timestamp: Date;
}) {
  const dateStr = opts.timestamp.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const html = baseHtml(`
    <h2>New Login Detected</h2>
    <p>Hi ${opts.name}, a new sign-in to your NetClass account was just recorded.</p>
    <div class="cred">
      <dt>Time</dt><dd>${dateStr}</dd>
      <dt>IP Address</dt><dd>${opts.ip}</dd>
      <dt>Device</dt><dd>${opts.userAgent.slice(0, 120)}</dd>
    </div>
    <div class="alert">⚠️ If this wasn't you, please change your password immediately and contact your administrator.</div>
    <a class="btn" href="${APP_URL}/profile">Manage Account</a>
  `);

  await sendMail({
    to: opts.to,
    subject: "NetClass — New login detected",
    html,
    text: `New login to your NetClass account from ${opts.ip} at ${dateStr}. If this wasn't you, change your password immediately.`,
  });
}

/** Pending approval notification sent to admin when a new registration arrives */
export async function sendNewRegistrationNotice(opts: {
  adminEmail: string;
  applicantName: string;
  applicantEmail: string;
  role: string;
}) {
  const html = baseHtml(`
    <h2>New ${opts.role} Registration</h2>
    <p>A new <strong>${opts.role}</strong> has applied to join NetClass.</p>
    <div class="cred">
      <dt>Name</dt><dd>${opts.applicantName}</dd>
      <dt>Email</dt><dd>${opts.applicantEmail}</dd>
    </div>
    <a class="btn" href="${APP_URL}/approvals">Review Application</a>
  `);

  await sendMail({
    to: opts.adminEmail,
    subject: `NetClass — New ${opts.role} registration: ${opts.applicantName}`,
    html,
    text: `New ${opts.role} registration from ${opts.applicantName} (${opts.applicantEmail}). Review at ${APP_URL}/approvals`,
  });
}

/** Rejection email sent to applicant */
export async function sendRejectionEmail(opts: {
  to: string;
  name: string;
  role: string;
  reason?: string;
}) {
  const html = baseHtml(`
    <h2>Registration Update</h2>
    <p>Hi ${opts.name}, thank you for your interest in joining NetClass as a <strong>${opts.role}</strong>.</p>
    <p>After review, your registration could not be approved at this time.</p>
    ${opts.reason ? `<div class="cred"><dt>Reason</dt><dd>${opts.reason}</dd></div>` : ""}
    <p>If you believe this is an error or your circumstances have changed, please contact your institution's administrator.</p>
  `);

  await sendMail({
    to: opts.to,
    subject: "NetClass — Registration update",
    html,
    text: `Hi ${opts.name}, your ${opts.role} registration could not be approved. ${opts.reason ? `Reason: ${opts.reason}` : ""}`,
  });
}
