Absolutely 😄. We’ll **skip testing** and move on. You’ve already got enough testing foundation to come back to it when you actually need it.

## Background Jobs — from zero

This is a really important backend concept, and I want us to learn it the same way we did Redis: **understand the mechanism first, then introduce tools like Redis/BullMQ later.**

### First: what problem do background jobs solve?

Imagine your API receives:

```text
POST /api/events
```

And creating an event requires:

1. Save event to PostgreSQL
2. Send confirmation email
3. Notify followers
4. Generate an event image
5. Update analytics
6. Send a notification
7. Write some external data

If you do **everything inside the HTTP request**:

```text
Client
  ↓
POST /events
  ↓
Controller
  ↓
Create event
  ↓
Send email
  ↓
Notify users
  ↓
Generate image
  ↓
Analytics
  ↓
Response
```

The user might sit there waiting for all of that.

That's where **background jobs** come in.

---

# The fundamental idea

A background job means:

> **"This work needs to happen, but it doesn't need to happen before I respond to the user."**

Instead:

```text
Client
   ↓
POST /events
   ↓
Create event
   ↓
Put a job somewhere
   ↓
Respond immediately
   ↓
201 Created
```

Meanwhile, separately:

```text
                 Job Queue
                    ↓
                 Worker
                    ↓
             Process the job
                    ↓
             Send email
```

So we separate:

### Request work

Things that must happen before responding.

### Background work

Things that can happen afterward.

---

# Think of a restaurant 🍽️

You walk into a restaurant and order:

> "One chicken burger."

The waiter doesn't stand in the kitchen waiting for the chef to finish.

Instead:

```text
You
 ↓
Waiter
 ↓
Order ticket
 ↓
Kitchen queue
 ↓
Chef
 ↓
Burger
```

The **order ticket** is essentially the job.

The **kitchen queue** is the job queue.

The **chef** is the worker.

---

# Three important pieces

When we talk about background jobs, you'll repeatedly see these three concepts:

```text
        ┌──────────────┐
        │     APP      │
        │              │
        │ "Send email" │
        └──────┬───────┘
               │
               ↓
        ┌──────────────┐
        │  JOB QUEUE   │
        │              │
        │  email job   │
        └──────┬───────┘
               │
               ↓
        ┌──────────────┐
        │    WORKER    │
        │              │
        │ process job  │
        └──────────────┘
```

### 1. Producer

Your application creates the job.

```ts
queue.add("send-email", {
  userId: 123,
  email: "john@example.com"
});
```

The application is the **producer**.

---

### 2. Queue

The queue holds jobs waiting to be processed.

Conceptually:

```text
QUEUE

[Job 1]
[Job 2]
[Job 3]
[Job 4]
```

Jobs can wait there.

The API doesn't have to process them immediately.

---

### 3. Worker

The worker takes jobs from the queue and performs them.

```text
Queue
  ↓
Worker
  ↓
"send email"
```

The worker is responsible for the actual work.

---

# Why not just use `setTimeout()`?

You might think:

```ts
setTimeout(() => {
  sendEmail();
}, 5000);
```

That technically runs something later.

But **that's not a proper background-job system**.

Imagine your server crashes:

```text
API server
   ↓
setTimeout()
   ↓
💥 SERVER CRASH
```

The job disappears.

Or imagine you have:

```text
Server 1
Server 2
Server 3
```

Now you need proper coordination.

A job queue gives you things like:

* persistence
* retries
* failure handling
* delayed jobs
* multiple workers
* concurrency
* job status
* monitoring

And this is where **Redis becomes useful again.**

---

# Your Redis knowledge is about to connect 🔥

You've just learned Redis as:

```text
Application
     ↓
Redis
```

For caching:

```text
Application → Redis → cached data
```

With background jobs, Redis can instead help coordinate:

```text
Application
     ↓
Redis
     ↓
Job Queue
     ↓
Worker
```

A popular Node.js solution is **BullMQ**, which uses Redis.

But **don't jump to BullMQ yet.**

I want you to understand the mechanism first.

---

# First mental exercise

Suppose Eventra does this:

```text
POST /api/events
```

When an event is created, we want to send an email to the event organizer.

Without background jobs:

```text
POST /events
 ↓
Create event
 ↓
Send email
 ↓
Return 201
```

With background jobs:

```text
POST /events
 ↓
Create event
 ↓
Create email job
 ↓
Return 201
```

Then:

```text
Email Queue
 ↓
Worker
 ↓
Send email
```

### Here's your first question:

**Why is sending the email a good candidate for a background job, while creating the event in PostgreSQL is NOT something we'd normally push into a background job?**

Yes — **you've got the idea.** 🔥 I'd just sharpen one part of your wording.

The important distinction isn't really *"inside the app vs third party."* It's:

> **Does this work need to finish before we can safely respond to the client?**

For creating the event, yes:

```text
POST /events
   ↓
Controller
   ↓
Service
   ↓
PostgreSQL
   ↓
Event successfully created
   ↓
201 Created
```

The client needs to know whether the event was actually created. So that is part of the **request's critical path**.

But email:

```text
POST /events
   ↓
Create event
   ↓
Queue "send confirmation email"
   ↓
201 Created
```

Then separately:

```text
             Queue
               ↓
             Worker
               ↓
        Email provider
               ↓
         Email sent
```

The API doesn't need to sit there waiting for the email provider.

### One subtle but important point

You said:

> "email is an asynchronous event"

You're **close**, but I'd phrase it as:

**Sending the email is asynchronous work that we choose to execute as a background job.**

An *event* and a *background job* aren't necessarily the same thing.

For example:

```text
Event:
"EventCreated"

        ↓

Background job:
"Send confirmation email"
```

The event describes **something that happened**.

The job describes **work that needs to be done**.

That distinction becomes very useful later when we get into **event-driven architecture**, which is also on your roadmap.

---

And here's where background jobs become really powerful:

Suppose sending the email fails.

Without a queue:

```text
POST /events
 ↓
Create event
 ↓
Send email ❌
 ↓
???
```

With a queue:

```text
POST /events
 ↓
Create event ✅
 ↓
Queue email job ✅
 ↓
201 Created

             ↓
          Worker
             ↓
       Send email ❌
             ↓
          Retry
             ↓
       Send email ❌
             ↓
          Retry
             ↓
       Send email ✅
```

**The API request doesn't have to fail just because the email temporarily failed.**

That's one of the biggest reasons background jobs exist.

Let's go. 🔥

We're going to **build the mechanism ourselves first** so BullMQ later feels obvious rather than magical.

## Step 1 — Forget Redis for a moment

Imagine we have this:

```ts
const jobs = [];
```

This is our pretend **job queue**.

A job might look like:

```ts
{
  type: "send-email",
  data: {
    to: "john@example.com",
    subject: "Welcome"
  }
}
```

So when our application wants something done later, it adds a job:

```ts
jobs.push({
  type: "send-email",
  data: {
    to: "john@example.com",
    subject: "Welcome"
  }
});
```

Our queue now contains:

```text
jobs

┌─────────────────────────────┐
│ send-email                  │
│ to: john@example.com        │
│ subject: Welcome             │
└─────────────────────────────┘
```

The important thing:

**The API did not send the email.**

It simply said:

> "Here's some work that needs to be done."

---

# Step 2 — The worker

Now we need something that continuously looks at the queue.

Conceptually:

```ts
while (true) {
  // check queue

  // if there is a job
  // process it
}
```

That's our **worker**.

Its responsibility is:

```text
Queue
  ↓
Take job
  ↓
Figure out what type of job it is
  ↓
Perform the work
  ↓
Remove job
```

For example:

```ts
const job = jobs.shift();
```

`shift()` removes the **first item** from the array.

So:

```text
Before:

[Job A, Job B, Job C]

shift()

After:

[Job B, Job C]

returned → Job A
```

That's basically the beginning of a queue.

---

# Step 3 — Producer vs Worker

Now we have two separate pieces.

### Producer

The application creates jobs:

```text
API
 ↓
jobs.push(...)
```

### Worker

The worker consumes jobs:

```text
Worker
 ↓
jobs.shift()
 ↓
process job
```

So:

```text
             PRODUCER
                 ↓
        ┌────────────────┐
        │   JOB QUEUE    │
        └───────┬────────┘
                ↓
             WORKER
                ↓
             Do work
```

This is the fundamental architecture behind the systems we'll eventually use.

---

## Your exercise 🧠

Don't copy code yet.

Imagine we have:

```ts
const jobs = [];
```

I want you to create **two functions**:

### 1. `addJob()`

It should add this job to the queue:

```text
{
  type: "send-email",
  data: {
    to: "john@example.com"
  }
}
```

### 2. `processJob()`

It should:

1. Take the first job from the queue
2. Check whether there is a job
3. Print something like:

```text
Processing send-email job for john@example.com
```

4. Remove it from the queue.

## Much Description

Absolutely. Let’s go through **background jobs in TypeScript + Express** from the ground up, but in the way you prefer: **build it, understand what each piece does, then gradually make it production-like.**

We’ll use a simple mental model first:

```text
HTTP Request
     │
     ▼
Express Controller
     │
     │ "send this email"
     ▼
   Job Queue
     │
     ▼
   Worker
     │
     ▼
  Actual Work
```

The key idea is:

> **The Express server receives the request; the worker does the slow/background work separately.**

---

# 1. Why do we need background jobs?

Imagine your Eventra API has:

```http
POST /api/events/create-event
```

When someone creates an event, you might want to:

1. Save the event to PostgreSQL
2. Send a confirmation email
3. Notify 500 registered users
4. Generate a PDF ticket
5. Resize an uploaded image
6. Send a notification

If you do everything inside the request:

```ts
app.post("/events", async (req, res) => {
  await createEvent();
  await sendEmail();
  await generatePdf();
  await notifyUsers();

  res.json({ message: "Event created" });
});
```

the user has to wait for **all of that**.

That's bad.

Instead:

```text
Request
   │
   ├── Create event
   │
   └── Add "send email" job
             │
             ▼
        Response immediately
```

Then somewhere else:

```text
Worker
   │
   └── picks up "send email"
             │
             ▼
        sends email
```

So the API can respond quickly.

---

# 2. The three important pieces

For now, forget Redis, BullMQ, etc.

There are **three concepts** you need to hardcode into your brain.

### Producer

Creates/adds jobs.

```ts
addJob({
  type: "send-email",
  data: {
    to: "john@example.com"
  }
});
```

### Queue

Stores jobs waiting to be processed.

```ts
const jobs = [];
```

### Worker

Takes jobs from the queue and performs the work.

```ts
processJob();
```

So:

```text
Producer → Queue → Worker
```

That's the fundamental architecture.

---

# 3. Let's build a tiny queue ourselves

Before touching Redis/BullMQ, let's understand the mechanism.

Create:

```text
background-jobs/
└── queue.ts
```

Start with:

```ts
type Job = {
  type: string;
  data: unknown;
};

const jobs: Job[] = [];

export function addJob(job: Job) {
  jobs.push(job);

  console.log("Job added:", job);
}

export function getNextJob() {
  return jobs.shift();
}
```

There are two important functions.

### `addJob()`

Adds work:

```ts
addJob({
  type: "send-email",
  data: {
    to: "john@example.com"
  }
});
```

The queue becomes:

```text
[
  {
    type: "send-email",
    data: {
      to: "john@example.com"
    }
  }
]
```

### `getNextJob()`

```ts
const job = getNextJob();
```

`shift()` removes the **first** job.

So:

```text
Queue

Job A
Job B
Job C

   ↓ getNextJob()

Job B
Job C

Worker receives Job A
```

That's basically **FIFO**:

> First In, First Out.

---

# 4. Now create the worker

Create:

```text
worker.ts
```

```ts
import { getNextJob } from "./queue.js";

export function processJob() {
  const job = getNextJob();

  if (!job) {
    console.log("No jobs to process.");
    return;
  }

  console.log("Processing:", job);

  switch (job.type) {
    case "send-email":
      console.log("Sending email...");
      break;

    default:
      console.log("Unknown job type:", job.type);
  }
}
```

Now we have:

```text
queue.ts
   │
   │ getNextJob()
   ▼
worker.ts
```

---

# 5. But here's the important part

A background worker usually **keeps running**.

We don't want:

```ts
processJob();
```

to execute once and die.

We want:

```text
Worker starts

   ↓

Check queue

   ↓

Job available?
   │
   ├── YES → process it
   │
   └── NO → wait

   ↓
Check again
```

For learning, we can do:

```ts
import { processJob } from "./worker.js";

setInterval(() => {
  processJob();
}, 1000);
```

Now every second:

```text
Worker
  │
  ├── check queue
  ├── process job
  ├── check queue
  ├── process job
  └── ...
```

That's your first **background worker**.

---

# 6. Now bring Express into it

This is where it becomes useful.

Imagine:

```text
POST /send-email
```

Your controller doesn't actually send the email.

It creates a job.

```ts
import { addJob } from "./queue.js";

export function sendEmail(req, res) {
  addJob({
    type: "send-email",
    data: {
      to: req.body.to
    }
  });

  res.json({
    message: "Email queued"
  });
}
```

The request is now:

```text
Client
   │
   │ POST /send-email
   ▼
Express
   │
   │ addJob()
   ▼
Queue
   │
   └───────────────┐
                   │
                   ▼
                Worker
                   │
                   ▼
              Send email
```

And the client gets:

```json
{
  "message": "Email queued"
}
```

**before the email is actually sent.**

That's the whole point.

---

# 7. One very important distinction

Don't confuse:

```text
async/await
```

with:

```text
background jobs
```

For example:

```ts
await sendEmail();
```

is still part of the request.

The request waits.

Whereas:

```ts
addJob({
  type: "send-email",
  data: {...}
});
```

means:

> "Here's some work. Somebody else can do it."

Then the worker handles it.

---

# 8. Our learning progression

I recommend we go through background jobs in this order:

### Stage 1 — Understand the mechanics

We'll build:

```text
Express
   ↓
Queue
   ↓
Worker
```

using plain TypeScript.

### Stage 2 — Make jobs asynchronous

We'll deal with:

```ts
async function processJob() {}
```

and real simulated work:

```ts
await new Promise(resolve => setTimeout(resolve, 3000));
```

### Stage 3 — Job states

We'll introduce:

```text
waiting
processing
completed
failed
```

### Stage 4 — Errors

What happens when:

```ts
sendEmail()
```

fails?

We'll learn retries and failure handling.

### Stage 5 — Multiple job types

For example:

```text
send-email
resize-image
generate-ticket
send-notification
generate-report
```

### Stage 6 — Persistence

Our current:

```ts
const jobs: Job[] = [];
```

has a huge problem.

If the server crashes:

```text
RAM
 ↓
jobs disappear
```

So we'll introduce **Redis**.

### Stage 7 — BullMQ

Then we'll move to the production-style ecosystem:

```text
Express
   ↓
BullMQ
   ↓
Redis
   ↓
Worker
```

And eventually you'll understand things like:

```ts
queue.add("send-email", data);
```

rather than just memorizing the syntax.

---

## Your first mental model

Burn this into your head:

```text
                    ┌──────────────┐
                    │    Queue     │
                    │              │
Client → Express →  │  Job 1       │
                    │  Job 2       │
                    │  Job 3       │
                    └──────┬───────┘
                           │
                           ▼
                     ┌──────────┐
                     │  Worker  │
                     └────┬─────┘
                          │
                          ▼
                    Actual work
```

And the vocabulary:

**Producer** → puts work into the queue
**Queue** → holds work
**Worker** → takes work out and executes it
**Job** → one unit of work

Since you were already building the simple `jobs = [] → addJob() → processJob()` example, **let's continue from exactly there next** and turn it into a proper TypeScript queue with typed job payloads before introducing Redis.

# WHERE REDIS, bullMQ come in and what each does
Yes — **this is actually the right point to understand Redis and BullMQ conceptually before we write more TypeScript.** If you understand *why* they exist, the code later will make much more sense.

## 1. First: what problem are we solving?

We started with:

```text
Express
   ↓
jobs = []
   ↓
Worker
```

The problem is that:

```ts
const jobs = [];
```

lives **inside the Node.js process's memory**.

Imagine you have:

```text
Express Server
     │
     └── Node.js RAM
            │
            └── jobs[]
```

You add:

```text
send-email
send-ticket
resize-image
```

Then the server crashes.

💥 The jobs are gone.

Or you have two servers:

```text
Server A              Server B
   │                     │
jobs[]                jobs[]
```

They're completely separate.

That's where **Redis** enters.

---

# 2. What is Redis?

Redis is essentially a **very fast in-memory data store**.

You can think of it as a separate computer/service that your applications can talk to.

Instead of:

```ts
const jobs = [];
```

you can have:

```text
              Redis
          ┌─────────────┐
          │ Job 1       │
          │ Job 2       │
          │ Job 3       │
          └─────────────┘
             ▲       ▲
             │       │
          Express   Worker
```

Now the queue isn't trapped inside Express.

Both Express and the worker can access the same Redis instance.

---

# 3. So what exactly does Redis do for background jobs?

Redis gives us **shared, fast storage for the queue and its state**.

For example:

```text
Express
   │
   │ "Add this job"
   ▼
 Redis
   │
   │ Job waiting
   ▼
Worker
   │
   │ "Give me a job"
   ▼
 Redis
```

This means the API and worker don't need to be the same Node.js process.

That's a **huge architectural improvement**.

---

# 4. But Redis isn't the same thing as BullMQ

This distinction is extremely important.

Think:

> **Redis is the storage/engine. BullMQ is the job-queue system built on top of Redis.**

For example:

```text
              Your application
                    │
             ┌──────┴──────┐
             │             │
          Express        Worker
             │             │
             └──────┬──────┘
                    │
                 BullMQ
                    │
                  Redis
```

### Redis

Provides things like:

* very fast data storage
* lists
* sets
* sorted sets
* hashes
* atomic operations
* expiration/TTL
* pub/sub
* streams

### BullMQ

Uses Redis to implement **job-queue behavior**.

It gives you things like:

* adding jobs
* workers
* delayed jobs
* retries
* failed jobs
* completed jobs
* concurrency
* priorities
* scheduling
* job progress
* backoff
* job removal

So you don't have to manually build all of that.

---

# 5. Why not just use Redis directly?

You technically **can**.

For example, Redis has lists, so you could create something conceptually like:

```text
Redis list

[
  job1,
  job2,
  job3
]
```

Then your worker could take jobs from the list.

But very quickly you'll run into questions:

> What if the worker crashes while processing the job?

> How do I retry a failed job?

> How many times should I retry?

> How do I delay a job for 10 minutes?

> How do I prioritize urgent jobs?

> How do I know which jobs are completed?

> How do I prevent two workers from processing the same job?

> How do I run 10 jobs concurrently?

> How do I inspect failed jobs?

You could build all of this yourself.

But **that's exactly the kind of infrastructure BullMQ gives you.**

---

# 6. BullMQ is basically your job-management layer

Imagine you want to send an email.

With BullMQ, your Express application can conceptually say:

```ts
emailQueue.add("send-welcome-email", {
  userId: "123"
});
```

BullMQ takes care of putting that job into Redis.

You now have:

```text
                 Redis
                   │
        ┌──────────┴──────────┐
        │                     │
   waiting jobs           job metadata
        │
        ▼
     BullMQ
        │
        ▼
      Worker
```

The worker says:

```ts
new Worker("emails", async (job) => {
  // send email
});
```

BullMQ coordinates the work.

---

# 7. Let's follow one real job

Suppose someone registers on Eventra.

Your API receives:

```http
POST /api/auth/register
```

You create the user.

Then:

```ts
emailQueue.add("welcome-email", {
  userId: user.id,
  email: user.email
});
```

### What happens?

### Step 1 — Express

```text
User
 ↓
POST /register
 ↓
Express
```

### Step 2 — Add job

```text
Express
   ↓
BullMQ
```

### Step 3 — Redis stores it

```text
BullMQ
   ↓
Redis

WAITING
 └── welcome-email
```

### Step 4 — Worker sees it

```text
Redis
 ↓
BullMQ Worker
```

### Step 5 — Worker executes

```ts
await sendWelcomeEmail(...);
```

### Step 6 — Job becomes completed

Conceptually:

```text
WAITING
   ↓
ACTIVE
   ↓
COMPLETED
```

If something goes wrong:

```text
WAITING
   ↓
ACTIVE
   ↓
FAILED
   ↓
RETRY
```

That's where BullMQ becomes extremely useful.

---

# 8. Redis isn't necessarily doing the actual work

This is another important distinction.

Suppose the job is:

```text
"Generate a PDF"
```

Redis doesn't generate the PDF.

Redis doesn't send the email.

Redis doesn't resize the image.

The **worker** does that.

Redis mainly helps coordinate/store the jobs.

So:

```text
Redis
   │
   │ "Here's the job"
   ▼
Worker
   │
   ├── send email
   ├── generate PDF
   ├── resize image
   └── process payment
```

---

# 9. What does the architecture look like in a real backend?

Eventually your Eventra backend might look something like:

```text
                    ┌─────────────────┐
                    │     Client      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Express     │
                    │      API        │
                    └────────┬────────┘
                             │
                    add("email", data)
                             │
                             ▼
                    ┌─────────────────┐
                    │     BullMQ      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │      Redis      │
                    │                 │
                    │ Waiting         │
                    │ Active          │
                    │ Completed       │
                    │ Failed         │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Worker      │
                    │   Node.js app   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Actual work     │
                    │                 │
                    │ Email           │
                    │ PDF             │
                    │ Notifications  │
                    │ Images         │
                    └─────────────────┘
```

---

# 10. And this gives you scalability

This is one of the biggest reasons you'll see this architecture in production.

Suppose you have:

```text
1 API server
1 worker
```

Then traffic increases.

You can have:

```text
             Express
                │
       ┌────────┴────────┐
       ▼                 ▼
    Worker 1          Worker 2
       │                 │
       └────────┬────────┘
                ▼
              Redis
```

Need more processing?

```text
Worker 1
Worker 2
Worker 3
Worker 4
Worker 5
```

All consuming jobs from the same queue.

You don't necessarily need to make your Express server bigger just because background processing increased.

---

# 11. Concurrency becomes possible

Imagine 1,000 emails need to be sent.

One worker doing:

```text
Email 1
   ↓
Email 2
   ↓
Email 3
   ↓
...
```

could take a while.

BullMQ can allow controlled concurrency:

```text
             Redis
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
    Worker   Worker   Worker
      │         │        │
   Email 1   Email 2  Email 3
   Email 4   Email 5  Email 6
```

Or even one worker processing several jobs concurrently.

This is something we'll eventually configure and understand rather than just copy.

---

# 12. Retries are a major reason for using BullMQ

Suppose you're sending an email:

```text
Worker
  ↓
Email provider
  ↓
❌ Network error
```

We don't necessarily want:

```text
FAILED
DONE
```

We can say:

```text
Try 1 → failed
       ↓
Wait
       ↓
Try 2 → failed
       ↓
Wait
       ↓
Try 3 → success
```

That's called **retry with backoff**.

For example:

```text
1st attempt
     ↓
5 seconds
     ↓
2nd attempt
     ↓
30 seconds
     ↓
3rd attempt
```

BullMQ handles the mechanics.

---

# 13. Delayed jobs

Another useful feature:

> "Send this reminder tomorrow at 9 AM."

Your Express server doesn't need to sit there waiting.

You create:

```text
Job
 ↓
Redis
 ↓
WAITING/DELAYED
 ↓
time arrives
 ↓
Worker
 ↓
send reminder
```

This is very useful for:

* event reminders
* password-reset emails
* scheduled notifications
* subscription reminders
* payment reminders
* cleanup tasks

---

# 14. The relationship in one sentence

If you're learning backend seriously, remember this:

> **Redis is the fast data store that BullMQ uses to coordinate and persist queue state; BullMQ provides the actual job-queue abstraction, workers, retries, delays, concurrency, and job lifecycle management.**

And:

```text
Redis ≠ BullMQ
```

Instead:

```text
BullMQ
   ↓
uses
   ↓
Redis
```

---

# 15. Where TypeScript comes in

Now we can finally see why we're going to build the simple version first.

We'll first understand:

```ts
type Job = {
  type: string;
  data: unknown;
};

const jobs: Job[] = [];
```

Then:

```text
Producer
   ↓
jobs[]
   ↓
Worker
```

Then we'll replace:

```text
jobs[]
```

with:

```text
Redis
```

And eventually replace our homemade queue logic with:

```text
BullMQ
```

So the evolution becomes:

```text
LEVEL 1

Express
   ↓
Array
   ↓
Worker
```

↓

```text
LEVEL 2

Express
   ↓
Redis
   ↓
Worker
```

↓

```text
LEVEL 3

Express
   ↓
BullMQ
   ↓
Redis
   ↓
Worker
```

That progression is **much better for you than jumping straight into `new Queue()` and `new Worker()`**, because you'll understand what BullMQ is actually solving.

### The three things I want you to permanently associate:

**Redis** → fast shared data/state

**BullMQ** → job queue machinery

**Worker** → actually performs the work

And the core flow:

```text
                ADD JOB
Express ─────────────────────► BullMQ
                                  │
                                  ▼
                                Redis
                                  │
                                  │ GET JOB
                                  ▼
                               Worker
                                  │
                                  ▼
                            ACTUAL WORK
```


