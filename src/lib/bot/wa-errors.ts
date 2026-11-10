/** Plain-words causes for the WhatsApp error codes we are likely to see. Pure, so it is tested. */
export function explainWhatsAppError(code: number | null | undefined): string {
  switch (code) {
    case 131026:
      return "WhatsApp could not deliver to that number. Usually the number is not on WhatsApp, the person has not accepted WhatsApp's latest terms, or their WhatsApp is very old. Ask the customer to open WhatsApp once and update it, then try again, or check the number.";
    case 131047:
      return "More than 24 hours since the customer last messaged, and no approved template was used.";
    case 131049:
      return "WhatsApp chose not to deliver this message to protect the customer from too many business messages. Try again later.";
    case 131030:
      return "This number is not on the list of allowed test numbers. Add it in Meta's API setup, or switch the app to live mode.";
    case 131056:
      return "Too many messages to this same customer in a short time. Wait a little and try again.";
    case 130429:
      return "Sending too fast. Wait a minute and try again.";
    case 132000:
      return "The template needs a different number of details than the app sent. Check the template's samples in Meta.";
    case 132001:
      return "The template name or language is not found or not approved in Meta. Check the name and language on the Chatbot page.";
    case 132005:
    case 132007:
    case 132012:
    case 132015:
    case 132016:
      return "WhatsApp rejected the template text or its details. Check the template in Meta.";
    case 133010:
      return "The shop's WhatsApp number is not registered with the Cloud API.";
    case 190:
      return "The WhatsApp access token has expired or is wrong. Make a new one in Meta and put it in Hostinger.";
    default:
      return "";
  }
}

/** Last four digits only, for showing which number a message went to. */
export function maskPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length >= 4 ? `ending ${d.slice(-4)}` : "an unknown number";
}
