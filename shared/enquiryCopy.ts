/**
 * The response-time promise and the default wording built on it, shared by the
 * public enquiry form, the express-book form, the auto-reply email and the
 * Settings placeholders — so they can't drift apart again ("within 24 hours"
 * in some places, "within one business day" in others).
 */
export const ENQUIRY_RESPONSE_PROMISE = "within one business day";

/** Enquiry form header line (venue can override in Settings → Lead Form). */
export const DEFAULT_LEAD_FORM_SUBTITLE =
  `Tell us about your event and we'll get back to you ${ENQUIRY_RESPONSE_PROMISE}.`;

/** Success screen message ({venueName} is substituted). Venue can override. */
export const DEFAULT_FORM_SUCCESS_MESSAGE =
  `Thank you for your enquiry. The team at {venueName} will be in touch ${ENQUIRY_RESPONSE_PROMISE}.`;

/** Opening line of the auto-reply email. Venue can override. */
export const DEFAULT_AUTO_REPLY_INTRO =
  `Thanks so much for your enquiry — it's landed with us and a member of the team will be in touch ${ENQUIRY_RESPONSE_PROMISE}.`;
