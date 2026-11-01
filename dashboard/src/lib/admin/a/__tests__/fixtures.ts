/**
 * Email bodies in the shapes TRS mail arrives in (read off production, Nov 2026), with every
 * person, company, address and number replaced. This repo is public: nothing here is real.
 */

/** Gmail forward, plain text with Outlook's "<mailto:…>" duplicates and a wrapped Cc. */
export const GMAIL_FORWARD = [
  'Hi Jamie,',
  '',
  'Please see the thread below on the renewal.',
  '',
  'Warm regards,',
  '',
  'Sam',
  '',
  '---------- Forwarded message ---------',
  'From: Robin Ong <robin.ong@trade-risksol.com<mailto:robin.ong@trade-risksol.com>>',
  'Date: Tue, 4 Nov 2025 at 08:54',
  'Subject: Re: (TRS) Acme Services - PII',
  'To: Jamie Lee <jamie@acme-example.com.sg<mailto:jamie@acme-example.com.sg>>',
  'Cc: Ernest Tan <ernest.tan@trade-risksol.com<mailto:ernest.tan@trade-risksol.com>>, Sam Wong <',
  'sam.wong@trade-risksol.com>',
  '',
  'Dear Jamie,',
  '',
  'Attached is the renewal proposal form for your review.',
  '',
  'Robin',
].join('\r\n')

/** A client forwards two earlier emails in one message (TRS was copied on neither). */
export const CLIENT_FORWARDS_TWO = [
  'Hi Operations,',
  '',
  'Forwarding the two emails I sent Catherine about the damage at our unit. Please advise.',
  '',
  'Thanks',
  'Pat Lim',
  'Acme Retail Pte Ltd',
  '',
  '---------- Forwarded message ---------',
  'From: Pat Lim <pat.lim@acme-retail.example>',
  'Date: Tue, 22 Sep 2026 at 10:15',
  'Subject: Re: Damage at Harbourfront unit',
  'To: Catherine Lim <catherine.lim@trade-risksol.com>',
  '',
  'Hi Catherine, the repair quote is attached: Repair quotation HF-0922.pdf',
  'Policy no. 2026-F1234567-BFP.',
  '',
  '---------- Forwarded message ---------',
  'From: Pat Lim <pat.lim@acme-retail.example>',
  'Date: Mon, 21 Sep 2026 at 17:40',
  'Subject: Damage at Harbourfront unit',
  'To: Catherine Lim <catherine.lim@trade-risksol.com>',
  'Cc: Chris Goh <chris.goh@acme-retail.example>',
  '',
  'Hi Catherine,',
  'Water leaked from the ceiling on 20 Sep and damaged our stock. Photos below.',
  '[IMG_2041.jpg]',
  '[IMG_2042.jpg]',
].join('\n')

/** Outlook "Original Message" with an ISO date and quoted display names. */
export const OUTLOOK_ORIGINAL = [
  'Dear Catherine,',
  '',
  'We confirm the renewal. Please send the debit note.',
  '',
  'Regards',
  'Victor',
  '',
  'This email is confidential. If you are not the intended recipient, please delete it.',
  '',
  '-----Original Message-----',
  'From: "Catherine Lim" <catherine.lim@trade-risksol.com>',
  'Sent: 2026-10-15 12:44:00',
  'To: "李华" <victor.li@example-gas.com>',
  'Cc: "Ernest Tan <ernest.tan@trade-risksol.com>" <ernest.tan@trade-risksol.com>,"Operations Team" <operations@trade-risksol.com>,"Nora Teo" <nora.teo@example-trader.sg>',
  'Subject: Re: Re : Example Trader Group Pte Ltd - Renewal for Policy WC-0001234',
  '',
  'Dear Victor,',
  '',
  'Following up on the renewal below, due 1 Nov 2026.',
].join('\r\n')

/** Apple Mail "Begin forwarded message:" with a zone abbreviation and a narrow no-break space. */
export const APPLE_FORWARD = [
  '',
  'Kind regards,',
  'Riley',
  '',
  'Begin forwarded message:',
  '',
  'From: "Kwan, Morgan" <morgan.kwan@insurer-example.com>',
  'Date: 21 October 2026 at 11:40:35 AM HKT',
  'To: Riley Tan <riley.tan@example-hk.com>',
  'Cc: "Ho, Dana" <dana.ho@insurer-example.com>',
  'Subject: Example (HK) Limited - New registration',
  '',
  '﻿',
  'Hi Riley',
  '',
  'Please provide the following documents.',
].join('\r\n')

/** The same Apple forward as some clients deliver it: a blank line between every line. */
export const SPACED_FORWARD = 'Sent from my iPhone\n\r\n\r\nBegin forwarded message:\n\r\n\r\nFrom: quinn@example-water.com\n\r\nDate: 7 October 2026 at 1:27:00 PM SGT\n\r\nTo: robin.ong@traderisksol.com\n\r\nCc: Lou sales@example-water.com>\n\r\nSubject: Block 7 - Performance Bond\n\r\n\n\r\nHi Robin,\n\r\n\r\nSpoken and attach docs as require.\n\r\n\r\nRegards,\n\r\nQuinn'

/** Gmail reply with "> " quoting, the "wrote:" line wrapped over two lines. */
export const GMAIL_QUOTED = [
  'Hi Sam,',
  '',
  'Please proceed with the renewal. Thank you.',
  '',
  'Best Regards',
  'Max',
  '',
  'On Wed, Oct 14, 2026, 09:51 Sam Wong <sam.wong@trade-risksol.com>',
  'wrote:',
  '',
  '> Hi Max,',
  '>',
  '> We have received the renewal invitation for your WIC policy, which is due',
  '> to expire on 3 November 2026. The renewal premium is SGD 109.00.',
  '>',
  '> Sam',
].join('\r\n')

/** Outlook header block inside Gmail quoting, with *bold* labels and wrapped addresses. */
export const NESTED_OUTLOOK = [
  'Noted, thanks.',
  '',
  '>> Get Outlook for iOS',
  '>> ------------------------------',
  '>> *From:* Sam Wong <sam.wong@trade-risksol.com>',
  '>> *Sent:* Thursday, 08 October 2026 09:13:44',
  '>> *To:* Wendy Seah <wendy.seah@example-mail.com>',
  '>> *Cc:* Robin Ong <',
  '>> robin.ong@trade-risksol.com>; Operations Team <',
  '>> operations@trade-risksol.com>',
  '>> *Subject:* Re: (TRS) Example School - WIC Renewal',
  '>> 2026',
  '>>',
  '>> Dear Wendy,',
  '>>',
  '>> May I follow up on the renewal?',
].join('\r\n')

/** Chinese Outlook / Foxmail header block. */
export const CHINESE_HEADERS = [
  'Dear Catherine,',
  '',
  'Noted with thanks.',
  '',
  '________________________________',
  'Warmest regards',
  'Ivy',
  '',
  '发件人： Catherine Lim<mailto:catherine.lim@trade-risksol.com>',
  '发送时间： 2026-09-18 17:12',
  '收件人： ivy@example-logistics.cn<mailto:ivy@example-logistics.cn>',
  '抄送： Operations Team<mailto:operations@trade-risksol.com>',
  '主题： Re: Re: Pending Director Acceptance : Example Logistics',
  '',
  'Dear Ivy,',
  'Kindly sign the attached acceptance.',
].join('\r\n')

/** Outlook web "Received:" date line. */
export const OUTLOOK_RECEIVED = [
  'FYI below.',
  '',
  'From: LOW KAI <low.kai@example-civil.com>;',
  'Received: Mon Oct 19 2026 11:56:58 GMT+0800 (GMT+08:00)',
  'To: Group Claims <claims@insurer-example.com>',
  'Subject: Enquiry on Claim Payment - Claim No. GC26-004411',
  '',
  'Dear Claims team, please update on the payment.',
].join('\n')

/** Body text that mentions From: and Date: without being a header block. */
export const NOT_A_HEADER = [
  'Hi team,',
  '',
  'From: our side, the vehicle list is final.',
  'The cover should run from 1 Nov.',
  '',
  'Date: to be confirmed by the insurer.',
  '',
  'Thanks',
].join('\n')
