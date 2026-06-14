import { getMailer } from '../server/mail.js'

const SMTP_USER = (process.env.SMTP_USER || '').trim()
const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.gmail.com').trim()

function gmailSetupHints() {
  console.log('\nCommon fixes:')
  console.log('1. Enable 2FA on the sender Gmail: myaccount.google.com → Security → 2-Step Verification')
  console.log('2. Generate App Password: Security → App passwords → Create for "LenLearn LMS OTP"')
  console.log('3. Put the 16-character App Password in SMTP_PASS (not your regular Gmail password)')
  console.log('4. SMTP_USER should be noreply.lenlearnotp@gmail.com (or your dedicated OTP sender)')
}

async function testSmtp() {
  console.log('Testing SMTP config...')
  console.log('SMTP_USER:', SMTP_USER || '(not set)')
  console.log('SMTP_HOST:', SMTP_HOST)

  if (!SMTP_USER || !(process.env.SMTP_PASS || '').trim()) {
    console.error('SMTP_USER and SMTP_PASS must be set in .env')
    gmailSetupHints()
    process.exit(1)
  }

  const transporter = getMailer()
  if (!transporter) {
    console.error('Could not create mail transporter. Check SMTP_USER and SMTP_PASS.')
    gmailSetupHints()
    process.exit(1)
  }

  try {
    await transporter.verify()
    console.log('SMTP connection verified.')

    const testEmail = (process.env.SMTP_TEST_TO || SMTP_USER).trim()
    const from = (process.env.SMTP_FROM || SMTP_USER).trim()

    await transporter.sendMail({
      from,
      to: testEmail,
      subject: 'LenLearn LMS — SMTP Test',
      html: `
        <h2>SMTP Test Successful</h2>
        <p>LenLearn LMS email sending is working.</p>
        <p>OTP codes will be sent from this address.</p>
        <hr>
        <small>Sent at: ${new Date().toISOString()}</small>
      `,
      text: `LenLearn LMS SMTP test successful at ${new Date().toISOString()}. OTP codes will be sent from this address.`,
    })

    console.log('Test email sent to:', testEmail)
    console.log('Check your inbox.')
  } catch (err) {
    console.error('SMTP Error:', err?.message || err)
    gmailSetupHints()
    process.exit(1)
  }
}

testSmtp()
