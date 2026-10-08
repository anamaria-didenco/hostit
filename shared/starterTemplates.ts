/**
 * Starter email templates a venue can add in one click (Settings → Email →
 * Email templates). Written to suit any venue: they use template variables for
 * anything specific and promise nothing about how a particular venue runs.
 *
 * {{alternativeDates}} is deliberately not a known variable: the compose window
 * flags it so the sender fills in real dates before sending.
 */
export type StarterTemplate = { name: string; subject: string; body: string };

const SIGN_OFF = "Kind regards,\nThe {{venueName}} team";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "First reply: date available",
    subject: "Your enquiry with {{venueName}}",
    body: `Hi {{firstName}},

Thanks so much for your enquiry. It's lovely to hear from you.

Good news: {{eventDate}} is available at the moment. I'd love to hear a bit more about what you have in mind so we can put together the right options. Is there a good time for a quick chat this week, or would you rather I email some ideas through?

If you'd like us to pencil the date in while you decide, just let me know.

${SIGN_OFF}`,
  },
  {
    name: "Sending your proposal",
    subject: "Your proposal from {{venueName}}",
    body: `Hi {{firstName}},

Here's your proposal for {{eventDate}}:
{{proposalLink}}

It brings together everything we've talked about so far, along with pricing. Nothing is locked in yet, so if you'd like to change anything, just reply and we'll adjust it.

${SIGN_OFF}`,
  },
  {
    name: "Proposal follow-up",
    subject: "Following up on your proposal",
    body: `Hi {{firstName}},

Just checking in to see whether you've had a chance to look over your proposal. Here's the link again in case it's handy:
{{proposalLink}}

I'm happy to answer any questions or tweak anything that doesn't quite fit.

${SIGN_OFF}`,
  },
  {
    name: "Date on hold: deposit to confirm",
    subject: "We're holding {{eventDate}} for you",
    body: `Hi {{firstName}},

We've put a hold on {{eventDate}} for you, and we'll keep it until {{holdUntil}}.

To confirm the booking, we ask for a deposit of {{depositAmount}}. Once that's received, we'll confirm everything in writing. You can see your booking details here:
{{portalLink}}

If you need a little more time, let me know and we'll see what we can do.

${SIGN_OFF}`,
  },
  {
    name: "Booking confirmed",
    subject: "You're booked in for {{eventDate}}",
    body: `Hi {{firstName}},

Thank you. Your booking for {{eventDate}} is confirmed, and we're really looking forward to having you and your guests.

We'll be in touch closer to the day to go over the final details. In the meantime, you can see your booking here:
{{portalLink}}

If anything changes, just reply to this email.

${SIGN_OFF}`,
  },
  {
    name: "Checking in",
    subject: "Just checking in",
    body: `Hi {{firstName}},

I wanted to check in on your plans for {{eventDate}}. No pressure at all: if you're still deciding, or if things have changed, that's completely fine.

If it would help, I'm happy to answer any questions or send through some fresh options.

${SIGN_OFF}`,
  },
  {
    name: "Sorry, we're booked",
    subject: "About {{eventDate}} at {{venueName}}",
    body: `Hi {{firstName}},

Thanks so much for thinking of us. Unfortunately we're already booked on {{eventDate}}, and I'm sorry we can't make that one work.

If your date has any flexibility, we'd love to host you another day. These dates are free at the moment:
{{alternativeDates}}

Just reply with what suits and I'll check it for you.

${SIGN_OFF}`,
  },
  {
    name: "Win-back: planning something?",
    subject: "Planning another get-together?",
    body: `Hi {{firstName}},

It's been a little while since we last spoke, and I wanted to say hello. If you're planning a celebration or get-together in the coming months, we'd love to help.

You can tell us a bit about it here, and we'll come back to you with dates and options:
{{enquiryFormLink}}

Or simply reply to this email.

${SIGN_OFF}`,
  },
];
