# Emails on the Backend: The Full Picture

Email is one of those things that looks trivial (`sendEmail()`) but hides a lot of complexity. Let's build up the mental model from the ground up—**protocols → delivery → providers → architecture → deliverability**.

---

## 1. 📮 How Email Actually Travels

There are **three separate protocols** doing three different jobs. People conflate them constantly.

| Protocol | Direction | Purpose |
|---|---|---|
| **SMTP** | Send | Your server → recipient's mail server |
| **IMAP** | Receive | Mail client ↔ mail server (keeps mail on server) |
| **POP3** | Receive | Mail client downloads & often deletes from server |

For backend work, **you almost only care about SMTP**. IMAP/POP3 are for reading inboxes (e.g., a support-desk integration).

### The SMTP Journey

```
[Your App] → [SMTP Provider] → [Recipient MX server] → [Their inbox]
     │              │                    │
   API call     relays it            filters spam,
   or SMTP      via DNS MX           stores in mailbox
```

Key steps:

1. **DNS lookup**: your provider resolves the recipient domain's **MX record** to find their mail server.
2. **SMTP handshake**: `EHLO` → `MAIL FROM` → `RCPT TO` → `DATA` → `QUIT`.
3. **Relay & filtering**: the recipient's server checks SPF, DKIM, DMARC, spam score, reputation.
4. **Delivery**: accepted → goes to inbox / spam / promotions tab. Rejected → bounce.

**The critical insight:** *you don't control delivery*. You hand off to a provider, and the recipient's server decides your fate. That's why deliverability (section 5) matters so much.

---

## 2. 🏗️ Two Ways to Send

### A. Direct SMTP from Your Server (Don't do this in production)

```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,           // STARTTLS
  auth: { user: '...', pass: '...' },
});

await transporter.sendMail({
  from: '"Acme" <no-reply@acme.com>',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
});
```

**Problems with self-sending:**
- Your server's IP has **no sending reputation** → spam folder.
- Cloud providers (AWS, GCP) **block outbound port 25** by default.
- You must handle retries, bounces, DKIM signing, IP warming—all yourself.
- One bad campaign can blacklist your whole product's IP.

**When it's OK:** internal-only mail, dev/testing (use [MailHog](https://github.com/mailhog/MailHog) or [Mailpit](https://github.com/axllent/mailpit)), or tiny volumes.

### B. Transactional Email Providers (The Standard)

You call their **HTTP API** (or SMTP), they handle delivery, reputation, retries, bounces, and analytics.

Common providers:

| Provider | Strength |
|---|---|
| **Resend** | Modern DX, React Email, great for TS |
| **Postmark** | Best-in-class transactional deliverability |
| **SendGrid** | Scale + marketing + transactional |
| **Amazon SES** | Cheapest at scale, DIY-ish |
| **Mailgun** | Good API, strong inbound parsing |
| **Loops / Customer.io** | Marketing + lifecycle |

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Acme <no-reply@acme.com>',
  to: 'user@example.com',
  subject: 'Welcome',
  react: <WelcomeEmail name="Ada" />,   // React Email component
});
```

**Rule of thumb:** transactional (password reset, receipts) → Postmark/Resend/SES. Marketing (newsletters, drips) → separate provider/domain, always.

---

## 3. 🔀 Transactional vs. Marketing

Keep these **completely separate**—different subdomains, ideally different providers:

| | Transactional | Marketing |
|---|---|---|
| Trigger | User action | Campaign/schedule |
| Volume | Low, steady | High, bursty |
| Expectation | Expected & wanted | Opt-in required |
| Failure impact | Broken product (no reset email) | Missed campaign |
| Unsubscribe | Not applicable | Legally required |
| Typical domain | `mail.acme.com` | `news.acme.com` |

**Why separate?** If your marketing blasts tank the sending reputation, your password-reset emails stop arriving. Different subdomains = isolated reputations.

---

## 4. 🧱 Architecture: Where Email Fits in Your Backend

**Never send email synchronously in a request handler.** The provider API can be slow or down, and you don't want `/signup` to fail because Resend had a hiccup. This is exactly where **BullMQ** (from earlier!) shines.

### The Canonical Flow

```
[HTTP Request] → enqueue "send-email" job → return 200 immediately
                          │
                          ▼
                  [Email Worker] → provider API → done
                          │
                          ├─ on failure → retry with backoff
                          └─ after max retries → DLQ + alert
```

### A Clean Implementation

**1. Email service (provider-agnostic interface):**

```typescript
// email/service.ts
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { WelcomeEmail } from './templates/WelcomeEmail';

const resend = new Resend(process.env.RESEND_API_KEY!);

export type EmailJob =
  | { type: 'welcome'; to: string; name: string }
  | { type: 'reset-password'; to: string; token: string }
  | { type: 'receipt'; to: string; orderId: string; amount: number };

export async function sendEmail(job: EmailJob) {
  switch (job.type) {
    case 'welcome':
      return resend.emails.send({
        from: 'Acme <no-reply@mail.acme.com>',
        to: job.to,
        subject: 'Welcome to Acme',
        html: render(<WelcomeEmail name={job.name} />),
      });
    case 'reset-password':
      return resend.emails.send({
        from: 'Acme <no-reply@mail.acme.com>',
        to: job.to,
        subject: 'Reset your password',
        html: render(<ResetPassword token={job.token} />),
      });
    // ...
  }
}
```

**2. Enqueue from your request handler:**

```typescript
// routes/signup.ts
import { emailQueue } from '../queues';

app.post('/signup', async (req, res) => {
  const user = await createUser(req.body);

  await emailQueue.add('welcome', {
    type: 'welcome',
    to: user.email,
    name: user.name,
  }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: false,          // keep for DLQ triage
  });

  res.status(201).json({ id: user.id });
});
```

**3. Worker processes it:**

```typescript
// workers/email.ts
import { Worker } from 'bullmq';
import { sendEmail, EmailJob } from '../email/service';

const worker = new Worker<EmailJob>('email', async (job) => {
  await sendEmail(job.data);
}, {
  connection,
  limiter: { max: 50, duration: 1000 },   // respect provider rate limits
  concurrency: 10,
});

worker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err.message);
});
```

**4. Idempotency** — critical, since workers can retry:

```typescript
// Don't send the same welcome email twice if the job retries
const key = `email:welcome:${user.id}`;
const already = await redis.get(key);
if (already) return;
await sendEmail(job.data);
await redis.set(key, '1', 'EX', 60 * 60 * 24);   // 24h dedupe window
```

### Why This Architecture Wins

- **Fast requests**: user gets 200ms response, not 2s.
- **Resilient**: provider outage = jobs queue up, drain when it recovers.
- **Observable**: retries, failures, and DLQ all visible in BullMQ.
- **Rate-limited**: never blow past provider limits.
- **Idempotent**: dedupe keys prevent double-sends.

---

## 5. 🎯 Deliverability: The Part That Actually Matters

Your email can be "sent" (provider accepted it) and still never reach the inbox. Deliverability is decided by the **recipient's server** based on:

### The Three DNS Records (Non-Negotiable)

**SPF** — *"Which servers are allowed to send for my domain?"*
```
acme.com.  TXT  "v=spf1 include:_spf.resend.com -all"
```

**DKIM** — *cryptographic signature proving the email wasn't tampered with*
```
resend._domainkey.acme.com.  TXT  "v=DKIM1; k=rsa; p=MIGfMA0G..."
```

**DMARC** — *"What should recipients do if SPF/DKIM fail, and where to send reports?"*
```
_dmarc.acme.com.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@acme.com"
```

Set them up. Verify them. **This is 80% of the battle.**

### Other Deliverability Factors

- **IP reputation**: new IPs must be "warmed" (slowly ramp volume). Providers usually share pooled IPs, so you inherit the pool's reputation—usually a good thing.
- **Domain reputation**: consistent sending, low bounce/complaint rates.
- **Bounce handling**: remove hard bounces immediately. Repeatedly sending to bad addresses kills reputation.
- **Complaint handling**: honor spam complaints, unsubscribe requests instantly.
- **Content**: spammy words, image-only emails, link shorteners, and mismatched "From" names all hurt.
- **Engagement**: opens/clicks/moves-out-of-spam improve future placement.

### The Metrics to Watch

| Metric | Healthy | Act if... |
|---|---|---|
| Bounce rate | < 2% | > 3% → clean your list |
| Complaint rate | < 0.1% | > 0.3% → Gmail will throttle you |
| Open rate | 20–40% (transactional) | Sudden drop → deliverability issue |
| Spam folder rate | ~0% | Any → check DNS records |
| Provider "accepted" | 100% | Anything less → provider issue |

### Tools

- **Google Postmaster Tools** — reputation data for Gmail.
- **MXToolbox** — check SPF/DKIM/DMARC records.
- **mail-tester.com** — send a test, get a spam score.
- **Litmus / Email on Acid** — render testing across clients.

---

## 6. 📥 Bounces, Complaints & Webhooks

Your provider will POST **webhooks** for delivery events. Handle them.

```typescript
// webhooks/resend.ts
app.post('/webhooks/email', async (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'email.delivered':
      await markEmailDelivered(event.data.email_id);
      break;

    case 'email.bounced':
      // HARD bounce → remove from list permanently
      if (event.data.bounce_type === 'permanent') {
        await suppressEmail(event.data.to);
      }
      // SOFT bounce → retry later
      break;

    case 'email.complained':
      // User hit "spam" → unsubscribe immediately
      await unsubscribeAll(event.data.to);
      break;

    case 'email.delivery_delayed':
      // Log it; provider will retry
      break;
  }

  res.sendStatus(200);   // always 200 quickly, or provider retries
});
```

**Bounce classification matters:**
- **Hard bounce** (550, mailbox doesn't exist) → remove forever.
- **Soft bounce** (552, mailbox full; 4xx transient) → retry, but after N failures treat as hard.

Maintain a **suppression list** in your DB. Before sending anything, check it.

---

## 7. ⚖️ Legal & Compliance (Briefly)

Email is regulated. Know the basics:

- **CAN-SPAM (US)**: opt-out mechanism, accurate headers, physical address.
- **GDPR (EU)**: explicit consent for marketing; transactional is usually fine as "legitimate interest."
- **CASL (Canada)**: express or implied consent required.
- **PECR (UK)**: similar to GDPR.

**Practical rules:**
- Transactional emails (receipts, password resets) don't need consent.
- Marketing emails **always** need opt-in + easy unsubscribe.
- Include a physical mailing address in marketing emails.
- Honor unsubscribes within 24 hours (legally) — practically, instantly.

---

## 8. 🧰 Templates: React Email & Co.

Hand-writing HTML email is a special kind of hell (Outlook uses Word's rendering engine). Use a framework:

**React Email** (best for TS):

```tsx
// templates/WelcomeEmail.tsx
import { Html, Button, Container, Text } from '@react-email/components';

export function WelcomeEmail({ name }: { name: string }) {
  return (
    <Html>
      <Container>
        <Text>Hi {name}, welcome to Acme!</Text>
        <Button href="https://acme.com/dashboard">Get started</Button>
      </Container>
    </Html>
  );
}
```

Render to HTML server-side, send via provider. Keeps emails as **typed components**, previewable in dev.

**Other options:** MJML, Maizzle, or plain HTML + inlined CSS (via `juice`).

**Always provide a plain-text version**—some clients prefer it, and it helps deliverability.

---

## 9. 🧭 The Mental Model

Think of backend email as a **pipeline with distinct responsibilities**:

```
[Template]  →  [Enqueue]  →  [Worker]  →  [Provider]  →  [Recipient Server]  →  [Inbox]
   React        BullMQ       Retries       API call        SPF/DKIM/DMARC       Filters
   Email        Idempotency  Rate limit    + webhooks      + reputation         + spam
```

Each stage can fail independently, and each has its own tooling. The job of your backend is to **own stages 1–3** (what to send, when, with what retry semantics) and **delegate stages 4–6** (delivery, authentication, filtering) to a provider—while still observing them via webhooks.

---

## 🎯 Quick Checklist

- [ ] Transactional emails sent via provider API, **not** your server's SMTP.
- [ ] Marketing on a **separate subdomain + provider** from transactional.
- [ ] SPF, DKIM, DMARC configured and verified.
- [ ] Email sends go through a **queue** (BullMQ), not synchronously.
- [ ] Jobs are **idempotent** (dedupe keys).
- [ ] Retries with exponential backoff + a **DLQ**.
- [ ] Provider webhooks handled: delivered, bounced, complained.
- [ ] **Suppression list** maintained and checked before every send.
- [ ] Rate limiting respects provider caps.
- [ ] Templates as React Email components (or MJML), with plain-text fallback.
- [ ] Deliverability metrics monitored (Postmaster, mail-tester).

---

# Deep Dive: Typed Templates, Webhook Verification, SES & Multi-Tenant Architecture

Let's tackle all four. Each one represents a production-grade concern you'll hit once you move past a simple `sendEmail()` call.

---

## 1. 🧩 React Email + Typed Template System

The problem with ad-hoc templates: props drift, types rot, and nobody knows what fields a template actually needs until it crashes at send time. Here's how to build a **type-safe template registry**.

### The Pattern: Zod Schema + React Email + Registry

Each template defines its **props schema** with Zod. The registry maps template names → components + schemas. Sending becomes type-checked at both compile time and runtime.

```typescript
// emails/schemas.ts
import { z } from 'zod';

export const WelcomeProps = z.object({
  name: z.string(),
  loginUrl: z.string().url(),
});

export const ResetPasswordProps = z.object({
  token: z.string(),
  expiresIn: z.string(), // e.g. "1 hour"
});

export const ReceiptProps = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
});
```

```tsx
// emails/Welcome.tsx
import { Html, Button, Text, Container } from '@react-email/components';
import type { z } from 'zod';
import { WelcomeProps } from './schemas';

export function WelcomeEmail(props: z.infer<typeof WelcomeProps>) {
  return (
    <Html>
      <Container>
        <Text>Hi {props.name},</Text>
        <Button href={props.loginUrl}>Log in</Button>
      </Container>
    </Html>
  );
}
```

```typescript
// emails/registry.ts
import { WelcomeEmail } from './Welcome';
import { ResetPasswordEmail } from './ResetPassword';
import { ReceiptEmail } from './Receipt';
import * as schemas from './schemas';

export const templateRegistry = {
  welcome: {
    component: WelcomeEmail,
    schema: schemas.WelcomeProps,
    subject: (data: schemas.WelcomeProps) => `Welcome, ${data.name}!`,
  },
  'reset-password': {
    component: ResetPasswordEmail,
    schema: schemas.ResetPasswordProps,
    subject: () => 'Reset your password',
  },
  receipt: {
    component: ReceiptEmail,
    schema: schemas.ReceiptProps,
    subject: (data: schemas.ReceiptProps) => `Your receipt for ${data.orderId}`,
  },
} as const;

export type TemplateName = keyof typeof templateRegistry;
```

### The Type-Safe Send Function

```typescript
import { render } from '@react-email/render';
import { templateRegistry, TemplateName } from './registry';
import type { z } from 'zod';

type TemplateData<T extends TemplateName> = z.infer<
  (typeof templateRegistry)[T]['schema']
>;

export async function sendTypedEmail<T extends TemplateName>(args: {
  template: T;
  to: string;
  data: TemplateData<T>;
}) {
  const { component, schema, subject } = templateRegistry[args.template];

  // Runtime validation
  const parsed = schema.safeParse(args.data);
  if (!parsed.success) {
    throw new Error(
      `Invalid props for ${args.template}: ${parsed.error.message}`
    );
  }

  const html = await render(component(parsed.data));
  const text = await render(component(parsed.data), { plainText: true });

  return resend.emails.send({
    from: 'Acme <no-reply@mail.acme.com>',
    to: args.to,
    subject: subject(parsed.data),
    html,
    text,
  });
}
```

**What this buys you:**

- **Compile-time safety**: passing `{ orderId: 123 }` to `welcome` is a TS error.
- **Runtime safety**: the Zod parse catches bad data from untyped sources (webhooks, external APIs).
- **Discoverability**: autocomplete shows every template and its exact props.
- **Subject co-location**: the subject line lives next to the template, not scattered in calling code.

### Preview Server

React Email ships a preview server: `npx react-email dev`. It hot-reloads your templates with mock props. You can also build a custom preview harness that feeds each registry entry's schema-generated defaults, so you can see all templates with sample data instantly.

### Scaling This

For larger teams, split into **template packages** per domain (auth emails, billing emails, lifecycle emails). Each package exports its own registry fragment, and a root registry merges them. This keeps the monolith from becoming a `registry.ts` with 200 imports.

---

## 2. 🔐 Provider Webhook Handling with Signature Verification

Every provider signs webhooks differently. The **universal rule**: you must verify against the **raw request body**, not the parsed JSON. JSON parsing + re-stringifying changes bytes (whitespace, key order) and breaks the signature.

### The Raw Body Problem

Most frameworks parse JSON automatically. You need to **disable that for webhook routes**:

```typescript
// Express — use express.raw() ONLY on webhook routes
app.post('/webhooks/resend', express.raw({ type: 'application/json' }), handler);

// Next.js App Router — req.text() gives you raw bytes
export async function POST(req: NextRequest) {
  const payload = await req.text(); // NOT req.json()
  // ...
}
```

If you re-stringify parsed JSON, verification fails silently and you'll spend hours debugging.

### Resend (Svix-Based)

Resend uses **Svix** for signing. Headers are `svix-id`, `svix-timestamp`, `svix-signature`.

```typescript
import { Webhook } from 'svix';

const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);

app.post('/webhooks/resend', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = wh.verify(req.body.toString(), {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    });
    // event is verified — process it
    handleResendEvent(event);
    res.status(200).json({ received: true });
  } catch (err) {
    res.status(400).send('Invalid signature');
  }
});
```

**Key details**: The secret starts with `whsec_`. Svix includes a timestamp check (5-minute tolerance) to prevent replay attacks.

### SendGrid (ECDSA)

SendGrid uses **ECDSA with SHA-256**. Headers are `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp`.

```typescript
import { EventWebhook } from '@sendgrid/eventwebhook';

const verifyWebhook = new EventWebhook();
const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY!;

app.post('/webhooks/sendgrid', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Twilio-Email-Event-Webhook-Signature');
  const timestamp = req.get('X-Twilio-Email-Event-Webhook-Timestamp');

  if (!signature || !timestamp) {
    return res.status(400).send('Missing signature headers');
  }

  const isValid = verifyWebhook.verifySignature(
    publicKey,
    req.body.toString(),
    signature,
    timestamp
  );

  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  // SendGrid posts an ARRAY of events
  const events = JSON.parse(req.body.toString());
  for (const event of events) {
    // event.event === 'delivered' | 'bounce' | 'open' | 'click' | ...
  }

  res.sendStatus(200);
});
```

**Gotcha**: SendGrid's public key from the dashboard is base64-encoded. If your crypto library expects PEM format, wrap it.

### Amazon SES (SNS)

SES doesn't webhook directly — it publishes to **SNS**, which delivers to your HTTP endpoint. SNS uses its own signature scheme with a **SigningCertURL**.

```typescript
import crypto from 'crypto';
import https from 'https';

async function verifySnsMessage(payload: any): Promise<boolean> {
  const stringToSign = [
    `Message:\n${payload.Message}\n`,
    `MessageId:\n${payload.MessageId}\n`,
    payload.Subject ? `Subject:\n${payload.Subject}\n` : '',
    `Timestamp:\n${payload.Timestamp}\n`,
    `TopicArn:\n${payload.TopicArn}\n`,
    `Type:\n${payload.Type}\n`,
    payload.UnsubscribeURL ? `UnsubscribeURL:\n${payload.UnsubscribeURL}\n` : '',
  ].join('');

  const cert = await fetchCert(payload.SigningCertURL);
  const verifier = crypto.createVerify('RSA-SHA1');
  verifier.update(stringToSign);

  return verifier.verify(cert, Buffer.from(payload.Signature, 'base64'));
}

app.post('/webhooks/ses', express.json(), async (req, res) => {
  const payload = req.body;

  // SNS subscription confirmation
  if (payload.Type === 'SubscriptionConfirmation') {
    if (!(await verifySnsMessage(payload))) return res.sendStatus(403);
    await fetch(payload.SubscribeURL); // confirm the subscription
    return res.sendStatus(200);
  }

  if (payload.Type === 'Notification') {
    if (!(await verifySnsMessage(payload))) return res.sendStatus(403);
    const message = JSON.parse(payload.Message);
    // message.notificationType === 'Bounce' | 'Complaint' | 'Delivery'
  }

  res.sendStatus(200);
});
```

**Critical**: Validate that `SigningCertURL` starts with `https://sns.<region>.amazonaws.com/` before fetching it — otherwise you'll fetch attacker-controlled certs. SNS also retries failed deliveries, so your handler must return 200 quickly.

### The Universal Webhook Handler Pattern

Extract the common flow:

```typescript
type WebhookHandler = {
  verify: (rawBody: string, headers: Record<string, string>) => boolean;
  process: (event: unknown) => Promise<void>;
};

function createWebhookRoute(handler: WebhookHandler) {
  return async (req, res) => {
    const rawBody = req.body.toString();

    if (!handler.verify(rawBody, req.headers)) {
      return res.status(400).send('Invalid signature');
    }

    // Return 200 IMMEDIATELY, process async
    res.status(200).send('OK');

    try {
      await handler.process(JSON.parse(rawBody));
    } catch (err) {
      // Log to DLQ / alert — but don't retry the HTTP response
      console.error('Webhook processing failed:', err);
    }
  };
}
```

This decouples **verification** (must be synchronous, fast) from **processing** (can be slow, can fail).

---

## 3. ☁️ Amazon SES in Depth

SES is the **cheapest** transactional email at scale (~$0.10 per 1,000 emails), but you trade money for operational complexity.

### What SES Actually Gives You

- **SMTP interface** (port 587) or **AWS SDK** (`SendEmailCommand`, `SendRawEmailCommand`).
- **Configuration Sets**: groups of rules for event tracking, IP pools, TLS enforcement.
- **Event Destinations**: publish events to SNS, Kinesis Firehose, or EventBridge.
- **Dedicated IPs**: for reputation isolation ($$$ and requires warming).
- **V2 API**: supports templated emails with substitution data.

### The DIY Parts (What You Must Build)

| Concern | SES | Managed Provider |
|---|---|---|
| Retry logic | You build it | Built in |
| Bounce/complaint webhooks | SNS → your endpoint | Native HTTP |
| Suppression list | You build it (or use SES's account-level) | Managed |
| Template system | You build it (SES templates are basic) | React/HTML |
| Analytics | You build it (via event destinations) | Dashboard included |
| Rate limiting | You implement | Provider throttles you |

### Sending with SES v2 (TypeScript)

```typescript
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: 'us-east-1' });

async function sendViaSes(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const command = new SendEmailCommand({
    FromEmailAddress: 'no-reply@mail.acme.com',
    Destination: { ToAddresses: [args.to] },
    Content: {
      Simple: {
        Subject: { Data: args.subject },
        Body: {
          Html: { Data: args.html },
          Text: { Data: args.text },
        },
      },
    },
    ConfigurationSetName: 'acme-transactional', // for event tracking
  });

  try {
    const result = await ses.send(command);
    return result.MessageId;
  } catch (err: any) {
    // ThrottlingException → retry with backoff
    // MessageRejected → permanent failure
    // AccountSendingPausedException → quota issue
    throw err;
  }
}
```

### Event Tracking via Configuration Sets

Create a configuration set in SES, attach an **SNS event destination** for `Send`, `Delivery`, `Bounce`, `Complaint`, `Reject`. SNS delivers these to your webhook endpoint (verified as shown above).

```typescript
// Processing SES events
function handleSesEvent(message: any) {
  const type = message.notificationType; // 'Bounce', 'Complaint', 'Delivery'

  switch (type) {
    case 'Bounce':
      const bounce = message.bounce;
      if (bounce.bounceType === 'Permanent') {
        // Hard bounce — add to suppression list
        for (const recipient of bounce.bouncedRecipients) {
          addToSuppressionList(recipient.emailAddress);
        }
      }
      break;

    case 'Complaint':
      // Spam complaint — unsubscribe immediately
      for (const recipient of message.complaint.complainedRecipients) {
        unsubscribeAll(recipient.emailAddress);
      }
      break;

    case 'Delivery':
      markEmailDelivered(message.mail.messageId);
      break;
  }
}
```

### SES Quotas & Throttling

SES enforces **sending quotas** (emails/sec) and **daily quotas**. In sandbox mode, you're limited to 200/day and can only send to verified addresses. Request production access early.

Handle `ThrottlingException` in your worker with exponential backoff:

```typescript
import { ThrottlingException } from '@aws-sdk/client-sesv2';

async function sendWithRetry(args, attempt = 1): Promise<string> {
  try {
    return await sendViaSes(args);
  } catch (err) {
    if (err instanceof ThrottlingException && attempt < 5) {
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
      return sendWithRetry(args, attempt + 1);
    }
    throw err;
  }
}
```

### When SES Is the Right Choice

- You're sending **100k+ emails/month** and cost matters.
- You're comfortable building the operational layer (webhooks, suppression, analytics).
- You already use AWS and have infrastructure there.
- You don't need a polished dashboard for non-technical team members.

**When to avoid it**: early-stage products where engineering time is scarcer than money. Postmark/Resend at $15/month is cheaper than 2 days of building suppression + webhook handling.

---

## 4. 🏢 Full Email Microservice with Per-Tenant Limits & Analytics

This is the "platform" architecture: a shared email service that multiple products/tenants use, with isolation, quotas, and observability.

### Architecture Overview

```
[Product A] ─┐
[Product B] ─┼──→ [Email API] → [Queue] → [Worker Pool] → [Provider(s)]
[Product C] ─┘         │                         │
                       │                         ├─→ [Analytics DB]
                       │                         └─→ [Webhook Handler]
                       │
                  [Tenant Config DB]
                  (provider, limits, templates)
```

### Tenant Model

Each tenant has isolated configuration:

```typescript
interface TenantConfig {
  id: string;
  name: string;

  // Provider isolation
  provider: 'resend' | 'ses' | 'sendgrid';
  credentials: {
    apiKey?: string;   // encrypted at rest
    region?: string;   // for SES
  };

  // From identity
  fromEmail: string;
  fromName: string;

  // Rate limits (per tenant)
  rateLimit: {
    maxPerMinute: number;
    maxPerHour: number;
    maxPerDay: number;
  };

  // Quota (billing)
  quota: {
    monthlyLimit: number;   // e.g. 50,000
    currentUsage: number;
    resetAt: Date;
  };
}
```

### Per-Tenant Rate Limiting with Redis

Use **sliding window** or **fixed window counters** in Redis, keyed by tenant. BullMQ's built-in limiter is per-queue, but here you want **per-tenant** limiting within a single queue. Use a Lua script for atomicity:

```typescript
// rate-limiter.ts
import Redis from 'ioredis';

const redis = new Redis();

const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])

  local current = redis.call('GET', key)
  if current and tonumber(current) >= limit then
    local ttl = redis.call('TTL', key)
    return {0, ttl}
  end

  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('EXPIRE', key, window)
  end

  return {1, limit - count}
`;

export async function checkTenantRate(
  tenantId: string,
  window: 'minute' | 'hour' | 'day',
  limit: number
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const windowSeconds = { minute: 60, hour: 3600, day: 86400 }[window];
  const key = `ratelimit:${tenantId}:${window}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

  const [allowed, value] = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    limit,
    windowSeconds
  )) as [number, number];

  if (allowed === 1) {
    return { allowed: true, remaining: value, retryAfter: 0 };
  }

  return { allowed: false, remaining: 0, retryAfter: value };
}
```

Then in your worker, check all three windows before sending:

```typescript
async function processEmailJob(job: Job<EmailJob>) {
  const tenant = await getTenant(job.data.tenantId);

  // Check quota (monthly)
  if (tenant.quota.currentUsage >= tenant.quota.monthlyLimit) {
    throw new UnrecoverableError('Monthly quota exceeded');
  }

  // Check rate limits
  for (const [window, limit] of [
    ['minute', tenant.rateLimit.maxPerMinute],
    ['hour', tenant.rateLimit.maxPerHour],
    ['day', tenant.rateLimit.maxPerDay],
  ] as const) {
    const result = await checkTenantRate(tenant.id, window, limit);
    if (!result.allowed) {
      // Reschedule instead of failing
      throw new RateLimitError(`Tenant ${tenant.id} rate limited on ${window}`, result.retryAfter);
    }
  }

  // Send
  await sendViaProvider(tenant, job.data);

  // Increment usage atomically
  await incrementTenantUsage(tenant.id);
}
```

Handle `RateLimitError` in the worker's `failed` event by moving the job to delayed:

```typescript
worker.on('failed', async (job, err) => {
  if (err instanceof RateLimitError) {
    await job.moveToDelayed(Date.now() + err.retryAfter * 1000);
  }
});
```

### Analytics Pipeline

Every email lifecycle event should be recorded:

```typescript
// analytics.ts
import { MongoClient } from 'mongodb';

const events = mongo.db('email').collection('events');

async function recordEvent(event: {
  tenantId: string;
  emailId: string;
  type: 'sent' | 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked';
  recipient: string;
  metadata?: Record<string, unknown>;
}) {
  await events.insertOne({
    ...event,
    timestamp: new Date(),
  });
}

// Aggregate daily stats (run via cron)
async function aggregateDaily(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const stats = await events.aggregate([
    { $match: { timestamp: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { tenantId: '$tenantId', type: '$type' },
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  // Write to daily_stats collection
}
```

**Key analytics to track per tenant:**
- **Volume**: sent, delivered, bounced, complained over time.
- **Rates**: bounce rate, complaint rate, open rate, click rate.
- **Provider performance**: delivery latency by provider (if multi-provider).
- **Quota burn**: daily/monthly usage vs. limit.

### Multi-Provider Fallback

For resilience, route through multiple providers:

```typescript
const providers = ['resend', 'ses', 'sendgrid'];

async function sendWithFallback(tenant: TenantConfig, email: EmailData) {
  const ordered = [tenant.provider, ...providers.filter(p => p !== tenant.provider)];

  for (const provider of ordered) {
    try {
      return await sendVia(provider, tenant.credentials[provider], email);
    } catch (err) {
      if (isPermanentError(err)) throw err; // don't retry permanent failures
      // Log and try next provider
      console.warn(`Provider ${provider} failed, falling back`);
    }
  }

  throw new Error('All providers failed');
}
```

**Important**: only fall back on **transient** errors (5xx, timeouts, rate limits). A hard bounce from Resend will also hard bounce from SES — don't waste the fallback.

### Security Considerations

- **Credential encryption**: tenant API keys must be encrypted at rest (AWS KMS, HashiCorp Vault, or libsodium).
- **Tenant isolation**: a bug in one tenant's template must not leak data to another. Never share template state across tenants.
- **Audit logging**: every send should be attributable to a tenant + user + request ID.
- **Webhook routing**: if you use a shared webhook endpoint, route events by provider, not tenant — the provider knows which of *its* accounts sent the email, not your tenant IDs. Maintain a mapping table.

### The Mental Model

```
[Tenant Config] → [Quota Check] → [Rate Limit Check] → [Enqueue]
                                                            │
[Worker] ← [Dequeue] ← [Queue] ←────────────────────────────┘
   │
   ├─→ [Provider API] → [Provider Webhook] → [Analytics DB]
   │
   └─→ [Quota Increment] → [Redis]
```

Each concern is **separate**: config is static, quota is monthly, rate limit is per-window, sending is per-job, analytics is append-only. Keeping them decoupled means you can evolve any one without touching the others.

---

## 🎯 Which to Build First

If you're starting from scratch, the **priority order** is:

1. **Typed templates + registry** (day 1) — prevents prop drift immediately.
2. **Webhook verification** (week 1) — you need bounce/complaint handling before you hit volume.
3. **Queue-based sending** (week 1) — the BullMQ architecture from earlier.
4. **Per-tenant rate limiting** (when you have >1 tenant) — before then, global limits suffice.
5. **SES** (when cost matters) — start with Resend/Postmark, migrate when your bill justifies it.
6. **Full analytics** (when you have paying customers) — basic logging first, aggregation later.

