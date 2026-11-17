// The words of the emails the shop sends. Pure functions, easy to test and change.
// Every email is signed in the company's own name (brand settings; see brand-core.ts).
import type { Brand } from "./brand-core.ts";
import { inr2 as inr } from "./format.ts";

export type MailBrand = Pick<Brand, "shopName" | "place" | "tagline">;
const sign = (b: MailBrand) => `\n\nWarm regards,\n${[b.shopName, b.place].filter(Boolean).join(", ")}${b.tagline ? `\n${b.tagline}` : ""}`;

export type MailText = { subject: string; text: string };

export function resetEmail(name: string, link: string, b: MailBrand): MailText {
  return {
    subject: `Reset your ${b.shopName} password`,
    text:
      `Hello ${name},\n\nWe received a request to reset your password. Open this link to choose a new one. It works for 1 hour and only once:\n\n${link}\n\n` +
      `If you did not ask for this, you can ignore this email. Your password stays the same.${sign(b)}`,
  };
}

export function verifyEmail(name: string, link: string, b: MailBrand): MailText {
  return {
    subject: `Please confirm your email for ${b.shopName}`,
    text:
      `Hello ${name},\n\nWelcome to ${b.shopName}. Please confirm that this is your email by opening this link. It works for 2 days:\n\n${link}\n\n` +
      `If you did not create an account, you can ignore this email.${sign(b)}`,
  };
}

export type OrderMailInfo = { orderNo: string; name: string; items: number; shipping: number; country: string; note?: string | null };

export function orderMail(status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED", o: OrderMailInfo, b: MailBrand): MailText {
  const head = `Hello ${o.name},\n\n`;
  if (status === "REQUESTED") {
    return {
      subject: `We received your order ${o.orderNo}`,
      text: `${head}Thank you for your order ${o.orderNo}. Items total ${inr(o.items)}. We are checking availability and the shipping charge to ${o.country}, and will confirm shortly. You pay nothing until then.${sign(b)}`,
    };
  }
  if (status === "CONFIRMED") {
    return {
      subject: `Your order ${o.orderNo} is confirmed`,
      text:
        `${head}Your order ${o.orderNo} is confirmed.\n\nItems: ${inr(o.items)}\nShipping to ${o.country}: ${inr(o.shipping)}\nTotal: ${inr(o.items + o.shipping)}\n\n` +
        `We will message you with how to pay.${o.note ? `\n\nNote from us: ${o.note}` : ""}${sign(b)}`,
    };
  }
  if (status === "COMPLETED") {
    return {
      subject: `Your order ${o.orderNo} is on its way`,
      text: `${head}Your order ${o.orderNo} has been billed and is being sent to you.${o.note ? `\n\nNote from us: ${o.note}` : ""}\n\nThank you for shopping with us.${sign(b)}`,
    };
  }
  return {
    subject: `Your order ${o.orderNo} was cancelled`,
    text: `${head}Your order ${o.orderNo} has been cancelled.${o.note ? `\n\nNote from us: ${o.note}` : ""}\n\nIf this is a surprise, please message us and we will help.${sign(b)}`,
  };
}

export function ownerAlert(o: { orderNo: string; name: string; country: string; items: number; lines: number }): MailText {
  return {
    subject: `New website order ${o.orderNo}`,
    text: `${o.name} from ${o.country} placed order ${o.orderNo}: ${o.lines} item(s), ${inr(o.items)}. Open Online orders in the accounting app to reply.`,
  };
}
