export async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Maskan <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send email: ${text}`);
  }
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
