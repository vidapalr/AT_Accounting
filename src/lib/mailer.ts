import "server-only";
import nodemailer from "nodemailer";

import type { MailText } from "@/lib/shop-mail-text";

/**
 * Sends email through the shop's mailbox. The settings live in Hostinger's server settings only:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM (for example "Abhiram Textiles <orders@abhiraminc.com>").
 * Without them nothing is sent and the shop carries on, so an email problem never blocks an order.
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
}

export async function sendMail(to: string, mail: MailText): Promise<boolean> {
  if (!mailConfigured() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  try {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: process.env.MAIL_FROM, to, subject: mail.subject, text: mail.text });
    return true;
  } catch (error) {
    console.error("Email could not be sent:", (error as Error).message);
    return false;
  }
}
