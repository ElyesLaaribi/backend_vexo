const { Resend } = require("resend")

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM || "Vexo <onboarding@resend.dev>"

// ─── OTP verification email ───────────────────────────────────────────────────
const sendOtpEmail = async (toEmail, otp) => {
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Your Vexo verification code",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 10px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
        <tr><td align="center" style="padding-bottom:28px">
          <span style="font-size:28px;font-weight:800;color:#1E40AF;letter-spacing:2px">VEXO</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 4px 24px rgba(30,64,175,0.08)">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">Verify your email</p>
          <p style="margin:0 0 32px;font-size:15px;color:#64748b;line-height:1.6">
            Use the code below to complete your Vexo sign-up. It expires in <strong>15 minutes</strong>.
          </p>
          <div style="background:#f0f6ff;border:2px solid #bfdbfe;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px">
            <span style="font-size:46px;font-weight:800;letter-spacing:12px;color:#1E40AF;font-family:monospace">${otp}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
            If you didn't create a Vexo account, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px">
          <p style="margin:0;font-size:12px;color:#94a3b8">© 2025 Vexo. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })

  if (error) throw new Error(error.message)
}

// ─── Password reset email ─────────────────────────────────────────────────────
const sendEmail = async (options) => {
  const { error } = await resend.emails.send({
    from: FROM,
    to: options.email,
    subject: options.subject,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 10px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
        <tr><td align="center" style="padding-bottom:28px">
          <span style="font-size:28px;font-weight:800;color:#1E40AF;letter-spacing:2px">VEXO</span>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 4px 24px rgba(30,64,175,0.08)">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e293b">${options.subject}</p>
          <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.6">${options.message}</p>
          ${options.url ? `
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="${options.url}" target="_blank"
                style="background:#1E40AF;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;display:inline-block">
                Reset Password
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#94a3b8">This link expires in 10 minutes.</p>` : ""}
        </td></tr>
        <tr><td align="center" style="padding-top:24px">
          <p style="margin:0;font-size:12px;color:#94a3b8">© 2025 Vexo. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })

  if (error) throw new Error(error.message)
}

module.exports = { sendEmail, sendOtpEmail }