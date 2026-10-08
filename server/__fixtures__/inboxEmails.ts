/** Fixture emails for the inbox tests (raw RFC 822, as IMAP hands them over). */
export const CRLF = (s: string) => s.replace(/\r?\n/g, "\r\n");

export const FIXTURES = {
  /** Gmail reply to one of our emails: threads by In-Reply-To. */
  threadedReply: CRLF(`Return-Path: <sam.smith@gmail.com>
From: Sam Smith <Sam.Smith@gmail.com>
To: Bar Franco Events <events@barfranco.nz>
Subject: Re: Your event enquiry — Birthday
Date: Tue, 6 Oct 2026 09:15:00 +1300
Message-ID: <CAF1234reply@mail.gmail.com>
In-Reply-To: <vf-lead-42-abcDEF123@barfranco.nz>
References: <vf-lead-41-old@barfranco.nz> <vf-lead-42-abcDEF123@barfranco.nz>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="b1"

--b1
Content-Type: text/plain; charset="UTF-8"

Hi Ana,

Saturday the 14th works for us. Can we bring our own cake?

Thanks,
Sam

On Mon, 5 Oct 2026 at 16:02, Bar Franco Events <events@barfranco.nz>
wrote:

> Hi Sam,
>
> Thanks for your enquiry.
--b1
Content-Type: text/html; charset="UTF-8"

<div>Hi Ana,<br><br>Saturday the 14th works for us. Can we bring our own cake?<br><img src="https://tracker.example/pixel.gif"><script>alert(1)</script></div>
--b1--
`),

  /** A brand-new email from the client's address, no threading headers. */
  senderMatch: CRLF(`From: "Sam Smith" <sam.smith@gmail.com>
To: events@barfranco.nz
Subject: Quick question about parking
Date: Wed, 7 Oct 2026 10:00:00 +1300
Message-ID: <fresh-1@mail.gmail.com>
Content-Type: text/plain; charset=utf-8

Is there parking near the venue?
`),

  /** Outlook out-of-office (RFC 3834 Auto-Submitted). */
  outOfOffice: CRLF(`From: Sam Smith <sam.smith@gmail.com>
To: events@barfranco.nz
Subject: Automatic reply: Your event enquiry — Birthday
Auto-Submitted: auto-replied
X-Auto-Response-Suppress: All
Message-ID: <ooo-1@outlook.com>
In-Reply-To: <vf-lead-42-abcDEF123@barfranco.nz>
Content-Type: text/plain

I'm out of the office until Monday.
`),

  /** Out-of-office with no Auto-Submitted header — caught by the subject. */
  outOfOfficeBySubject: CRLF(`From: Sam Smith <sam.smith@gmail.com>
To: events@barfranco.nz
Subject: Out of Office: Re: Your proposal
Message-ID: <ooo-2@example.com>
Content-Type: text/plain

Away until the 20th.
`),

  /** Delivery failure (DSN). */
  bounce: CRLF(`Return-Path: <>
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: events@barfranco.nz
Subject: Delivery Status Notification (Failure)
Message-ID: <bounce-1@mx.google.com>
X-Failed-Recipients: sam.smith@gmial.com
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="r1"

--r1
Content-Type: text/plain

Address not found.
--r1
Content-Type: message/delivery-status

Final-Recipient: rfc822; sam.smith@gmial.com
Action: failed
Status: 5.1.1
--r1--
`),

  /** Someone we've never heard from. */
  unmatched: CRLF(`From: Stranger <someone@unknown.example>
To: events@barfranco.nz
Subject: Do you sell gift vouchers?
Message-ID: <stranger-1@unknown.example>
Content-Type: text/plain

Hello!
`),

  /** Our own BCC copy of an email we sent. */
  ownCopy: CRLF(`From: "Bar Franco Events" <events@barfranco.nz>
To: sam.smith@gmail.com
Subject: Re: Your event enquiry — Birthday
Message-ID: <vf-lead-42-ownCopy@barfranco.nz>
Content-Type: text/plain

Hi Sam, thanks for your enquiry.
`),

  /** Outlook-style reply with a From:/Sent: block and an attachment. */
  outlookReply: CRLF(`From: Sam Smith <sam.smith@gmail.com>
To: events@barfranco.nz
Subject: RE: Your event proposal
Message-ID: <outlook-1@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="m1"

--m1
Content-Type: text/plain

Looks good — signed copy attached.

From: Bar Franco Events <events@barfranco.nz>
Sent: Monday, 5 October 2026 4:00 PM
To: Sam Smith <sam.smith@gmail.com>
Subject: Your event proposal

Hi Sam, please find your proposal below.
--m1
Content-Type: application/pdf; name="signed-proposal.pdf"
Content-Disposition: attachment; filename="signed-proposal.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--m1--
`),
};
