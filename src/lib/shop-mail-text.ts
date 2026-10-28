// The words of the emails the shop sends. Pure functions, easy to test and change.
import { BRAND_NAME as BRAND, TAGLINE } from "./brand.ts";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sign = `\n\nWarm regards,\n${BRAND}, Kapra, Hyderabad\n${TAGLINE}`;

export type MailText = { subject: string; text: string };

export function resetEmail(name: string, link: string): MailText {
  return {
    subject: `Reset your ${BRAND} password`,
    text:
      `Hello ${name},\n\nWe received a request to reset your password. Open this link to choose a new one. It works for 1 hour and only once:\n\n${link}\n\n` +
      `If you did not ask for this, you can ignore this email. Your password stays the same.${sign}`,
  };
}

export type OrderMailInfo = { orderNo: string; name: string; items: number; shipping: number; country: string; note?: string | null };

export function orderMail(status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED", o: OrderMailInfo): MailText {
  const head = `Hello ${o.name},\n\n`;
  if (status === "REQUESTED") {
    return {
      subject: `We received your order ${o.orderNo}`,
      text: `${head}Thank you for your order ${o.orderNo}. Items total ${inr(o.items)}. We are checking availability and the shipping charge to ${o.country}, and will confirm shortly. You pay nothing until then.${sign}`,
    };
  }
  if (status === "CONFIRMED") {
    return {
      subject: `Your order ${o.orderNo} is confirmed`,
      text:
        `${head}Your order ${o.orderNo} is confirmed.\n\nItems: ${inr(o.items)}\nShipping to ${o.country}: ${inr(o.shipping)}\nTotal: ${inr(o.items + o.shipping)}\n\n` +
        `We will message you with how to pay.${o.note ? `\n\nNote from us: ${o.note}` : ""}${sign}`,
    };
  }
  if (status === "COMPLETED") {
    return {
      subject: `Your order ${o.orderNo} is on its way`,
      text: `${head}Your order ${o.orderNo} has been billed and is being sent to you.${o.note ? `\n\nNote from us: ${o.note}` : ""}\n\nThank you for shopping with us.${sign}`,
    };
  }
  return {
    subject: `Your order ${o.orderNo} was cancelled`,
    text: `${head}Your order ${o.orderNo} has been cancelled.${o.note ? `\n\nNote from us: ${o.note}` : ""}\n\nIf this is a surprise, please message us and we will help.${sign}`,
  };
}

export function ownerAlert(o: { orderNo: string; name: string; country: string; items: number; lines: number }): MailText {
  return {
    subject: `New website order ${o.orderNo}`,
    text: `${o.name} from ${o.country} placed order ${o.orderNo}: ${o.lines} item(s), ${inr(o.items)}. Open Online orders in the accounting app to reply.`,
  };
}
