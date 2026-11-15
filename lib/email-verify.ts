import "server-only"; // build fails if a client component ever imports this file
// Sending the verification email.
//
// Turn it on by setting these two variables on the server (Vercel > Settings > Environment Variables):
//   EMAIL_SERVER = an SMTP address, for example for Gmail with an "App password":
//                  smtps://yourname%40gmail.com:APP_PASSWORD@smtp.gmail.com:465
//   EMAIL_FROM   = the sender shown to people, for example:  Build_Core <yourname@gmail.com>
// If either is missing the whole verification step is OFF, so nobody can get locked out by a
// missing setting. Optional: EMAIL_VERIFY_GOOGLE=false  => people who sign in with Google skip the code
// (Google has already confirmed their address).

export const verificationEnabled = () =>
  !!(process.env.EMAIL_SERVER?.trim() && process.env.EMAIL_FROM?.trim());

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport(process.env.EMAIL_SERVER!.trim());
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  await transport.sendMail({
    from: process.env.EMAIL_FROM!.trim(),
    to,
    subject: `Your Build_Core verification code: ${spaced}`,
    text: `Your Build_Core verification code is ${spaced}.\n\nIt works for 10 minutes. If you did not try to sign in, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p>Enter this code in Build_Core to finish signing in:</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:16px 0">${spaced}</p>
      <p style="color:#555;font-size:13px">It works for 10 minutes. If you did not try to sign in, you can ignore this email.</p>
    </div>`,
  });
}
