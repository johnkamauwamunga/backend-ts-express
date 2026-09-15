Perfect. Let's start from **zero with callbacks**, then connect the idea directly to the BullMQ worker.

## 1. What is a callback?

A callback is simply:

> **A function that you give to another function so that the other function can call it later.**

For example:

```ts
function greet() {
  console.log("Hello Khalif");
}

function doSomething(callback: () => void) {
  console.log("Doing something...");

  callback();
}

doSomething(greet);
```

What happens?

```text
doSomething()
      ↓
"Doing something..."
      ↓
callback()
      ↓
greet()
      ↓
"Hello Khalif"
```

Notice something important:

We didn't do:

```ts
doSomething(greet());
```

We did:

```ts
doSomething(greet);
```

### Why?

Because:

```ts
greet()
```

means:

> **Run `greet` now.**

While:

```ts
greet
```

means:

> **Here is the function. You can run it when you need it.**

That's the fundamental distinction.

---

# 2. Let's make it more obvious

Imagine:

```ts
function cookFood() {
  console.log("Cooking...");
}

function restaurant(order: () => void) {
  console.log("Order received");

  // Later...
  order();
}

restaurant(cookFood);
```

The `restaurant` function receives `cookFood`.

It doesn't know exactly what `cookFood` does.

It simply knows:

> "I have been given a function. When the appropriate moment comes, I'll call it."

So:

```text
restaurant()
     │
     │ receives
     ↓
cookFood
     │
     │ later calls
     ↓
cookFood()
```

That's a callback.

---

# 3. You've already used callbacks

Remember our simulated email:

```ts
await new Promise((resolve) => {
  setTimeout(resolve, 3000);
});
```

Look at this:

```ts
(resolve) => {
  setTimeout(resolve, 3000);
}
```

That's a function being passed to `Promise`.

And:

```ts
setTimeout(resolve, 3000);
```

means roughly:

> "JavaScript, wait 3 seconds, then call `resolve`."

So `resolve` is being used as a callback.

Likewise:

```ts
setTimeout(() => {
  console.log("Three seconds passed");
}, 3000);
```

The function:

```ts
() => {
  console.log("Three seconds passed");
}
```

is a callback.

---

# 4. The most important part: who calls the callback?

This is the question I want you to hardcode.

Consider:

```ts
function doSomething(callback: () => void) {
  console.log("Starting...");

  callback();
}
```

You provide:

```ts
doSomething(() => {
  console.log("Finished!");
});
```

**You don't call the callback.**

`doSomething()` calls it.

So:

```text
YOU
 │
 │ give function
 ↓
doSomething()
 │
 │ decides when to call it
 ↓
callback()
```

This is why callbacks are powerful.

The function receiving the callback controls **when** it gets executed.

---

# 5. Now connect this to our Worker

Remember this:

```ts
const worker = new Worker(
  "email",
  async (job) => {
    console.log("Processing job");

    await sendEmail(job.data.email);
  }
);
```

Now you should recognize:

```ts
async (job) => {
   ...
}
```

as a **callback**.

We're giving that function to BullMQ.

We're essentially saying:

> **"BullMQ, whenever you have a job ready for this worker, call this function and give me the job."**

Conceptually:

```text
You
 │
 │ give BullMQ this function
 ↓
async (job) => {
    await sendEmail(...)
}
 │
 │
 ↓
BullMQ waits...
 │
 │
 │ Job arrives
 ↓
BullMQ calls your function
 │
 ↓
(job)
 │
 ↓
your code processes it
```

That's a huge connection.

---

# 6. And `job` is an argument

Look at:

```ts
async (job) => {
```

BullMQ calls your callback something like:

```ts
callback(job);
```

So `job` becomes the actual job that BullMQ wants you to process.

For example:

```text
BullMQ has:

Job #42
type: welcome-email
email: john@gmail.com
```

Then conceptually:

```ts
callback(job42);
```

Your callback receives:

```ts
job
```

and therefore:

```ts
job.data.email
```

gives:

```text
john@gmail.com
```

---

# 7. This is why callbacks matter so much in Node.js

You'll encounter them everywhere:

```ts
setTimeout(() => {}, 1000);
```

```ts
array.map((user) => {});
```

```ts
array.filter((user) => {});
```

```ts
app.get("/users", (req, res) => {});
```

```ts
new Worker("email", async (job) => {});
```

They're all variations of the same fundamental idea:

> **"Here's a function. You decide when to call it."**

---

## One distinction before we continue

Don't confuse **callback** with **async**.

This:

```ts
async (job) => {
   await sendEmail();
}
```

has two separate concepts:

```text
async
  ↓
allows the function to use await

(job) => {}
  ↓
this function is being provided as a callback
```

So **`async` doesn't make something a callback**.

The fact that the function is **passed to another piece of code to be called later** makes it a callback.

---

### Your first little exercise

Don't worry about BullMQ yet.

Given this:

```ts
function processUser(callback: (name: string) => void) {
  const name = "John";

  callback(name);
}
```

and:

```ts
processUser((name) => {
  console.log(`Welcome ${name}`);
});
```

Tell me **what happens step by step**.

Specifically, I want you to identify:

1. What is the callback?
2. Who calls the callback?
3. What does `name` represent?
4. What gets printed?

Absolutely. This is worth slowing down for, because **`new Promise((resolve, reject) => {})` is one of those pieces that, once it clicks, makes a lot of Node.js code suddenly make sense.**

Let's dissect it from the outside in.

## 1. Start with this

```ts
function waitTwoSeconds(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Two seconds are done");
    }, 2000);
  });
}
```

Don't worry about `async/await` yet.

Our question is:

> **What exactly is `new Promise(...)` doing?**

---

## 2. A Promise represents future work

When we do:

```ts
new Promise(...)
```

we are creating an object that represents an operation whose result **isn't available yet**.

Think:

```text
Promise
   │
   ├── PENDING       ← currently working
   │
   ├── FULFILLED     ← succeeded
   │
   └── REJECTED      ← failed
```

When the Promise is first created:

```text
PENDING
```

It stays pending until someone tells it:

> "We're done successfully."

or:

> "We failed."

---

# 3. Now look at the strange part

```ts
new Promise((resolve) => {
```

Remember our callback lesson?

This:

```ts
(resolve) => {
   ...
}
```

is a **callback function**.

We're passing that function to the `Promise` constructor.

So conceptually:

```text
You
 │
 │ give function
 ↓
Promise
 │
 │ calls the function
 ↓
(resolve)
```

But now something interesting happens.

**Promise gives our callback a function called `resolve`.**

---

# 4. What is `resolve`?

`resolve` is a function that Promise gives us.

Its job is:

> **Tell the Promise that the operation succeeded.**

For example:

```ts
resolve("Two seconds are done");
```

means:

```text
Promise was:
PENDING

        ↓

resolve(...)

        ↓

Promise becomes:
FULFILLED
```

And the value:

```text
"Two seconds are done"
```

becomes the result of the Promise.

---

# 5. Let's remove the timer for a moment

Look at this:

```ts
const promise = new Promise((resolve) => {
  resolve("Hello");
});
```

The sequence is:

```text
new Promise()
      ↓
Promise starts PENDING
      ↓
callback executes
      ↓
resolve("Hello")
      ↓
Promise becomes FULFILLED
      ↓
result = "Hello"
```

So if we later do:

```ts
const result = await promise;
```

we get:

```ts
result === "Hello"
```

---

# 6. Now put the timer back

Our original:

```ts
function waitTwoSeconds(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Two seconds are done");
    }, 2000);
  });
}
```

Let's execute it.

### At the beginning

```ts
waitTwoSeconds();
```

creates the Promise.

```text
PENDING
```

Then:

```ts
setTimeout(...)
```

registers the timer.

JavaScript continues doing other things.

After two seconds:

```ts
resolve("Two seconds are done");
```

runs.

Now:

```text
PENDING
   ↓
FULFILLED
```

And the Promise's result is:

```text
"Two seconds are done"
```

---

# 7. Now what is `reject`?

This is the other half.

A Promise can succeed:

```ts
resolve(value);
```

or fail:

```ts
reject(error);
```

So:

```ts
function doSomething(): Promise<string> {
  return new Promise((resolve, reject) => {

    const success = true;

    if (success) {
      resolve("Everything worked");
    } else {
      reject(new Error("Something went wrong"));
    }

  });
}
```

The lifecycle is:

```text
              Promise
                 │
              PENDING
              /     \
             /       \
            ↓         ↓
       resolve()    reject()
            ↓         ↓
       FULFILLED   REJECTED
```

---

# 8. Why do we need both?

Because real applications fail.

Imagine our Eventra email:

```ts
function sendEmail(email: string): Promise<void> {
  return new Promise((resolve, reject) => {

    // Contact email provider...

    if (emailProviderSucceeded) {
      resolve();
    } else {
      reject(new Error("Email provider failed"));
    }

  });
}
```

If successful:

```text
send email
   ↓
resolve()
   ↓
worker continues
```

If it fails:

```text
send email
   ↓
reject(error)
   ↓
worker knows it failed
```

And **this becomes very important when we get to BullMQ retries.**

BullMQ can detect that our worker's Promise failed and then apply retry behavior.

---

# 9. Now connect it to `async/await`

Suppose:

```ts
function waitTwoSeconds(): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("Done!");
    }, 2000);
  });
}
```

We can do:

```ts
async function main() {
  const result = await waitTwoSeconds();

  console.log(result);
}
```

The important mental model:

```text
waitTwoSeconds()
       ↓
returns Promise
       ↓
PENDING
       ↓
2 seconds
       ↓
resolve("Done!")
       ↓
FULFILLED
       ↓
await receives "Done!"
       ↓
result = "Done!"
```

So `await` is essentially saying:

> **"When this Promise successfully produces its result, give me that result and continue from here."**

---

# 10. And if it rejects?

Then:

```ts
async function main() {
  const result = await doSomething();
}
```

will throw an error.

We can handle it:

```ts
async function main() {
  try {
    const result = await doSomething();

    console.log(result);
  } catch (error) {
    console.log("Something failed");
  }
}
```

So:

```text
resolve()
   ↓
await gets result


reject()
   ↓
await throws error
```

---

# 11. Now look at our BullMQ Worker again

This should look much less mysterious now:

```ts
new Worker("email", async (job) => {
  await sendEmail(job.data.email);
});
```

There are several layers here:

### Layer 1 — Callback

```ts
async (job) => {
   ...
}
```

BullMQ will call this.

### Layer 2 — Promise

Because the callback is `async`, it automatically returns a Promise.

Conceptually:

```ts
async (job) => {
   await sendEmail(...);
}
```

is a function that says:

> "I will eventually tell BullMQ whether processing succeeded or failed."

### Layer 3 — Actual asynchronous operation

```ts
await sendEmail(...)
```

The email operation itself returns a Promise.

### Layer 4 — Success/failure

If email succeeds:

```text
sendEmail()
   ↓
resolve
   ↓
worker callback completes successfully
   ↓
BullMQ marks job COMPLETED
```

If email fails:

```text
sendEmail()
   ↓
reject / throws
   ↓
worker callback fails
   ↓
BullMQ marks job FAILED
   ↓
retry can happen
```

**And now we're starting to see why callbacks + Promises are so important for background jobs.**

---

## The mental model I want you to keep

```text
CALLBACK
"Here's a function. Call it later."

       ↓

PROMISE
"Here's an object representing future success/failure."

       ↓

resolve()
"The operation succeeded."

reject()
"The operation failed."

       ↓

ASYNC/AWAIT
"Let me work with those future results in readable code."

       ↓

BULLMQ WORKER
"Give me a job, I'll perform asynchronous work,
and I'll tell you whether that work succeeded or failed."
```

### One last distinction

This:

```ts
(resolve) => {
   resolve("Done");
}
```

is a **callback**.

This:

```ts
resolve("Done");
```

is **fulfilling the Promise**.

And this:

```ts
await somePromise;
```

is **consuming/waiting for the Promise's result**.

Those are three different things.

Once that distinction is clear, we're ready to look at **`.then()` and `.catch()`**, and then you'll see exactly how `async/await` is essentially a much cleaner way of working with Promises.

Yep. Let's continue. 🔥

We've built the **producer → queue → worker** mechanism. Now we need to make the worker behave more like a real worker.

## Step 4 — Job handlers

Right now our worker basically does:

```text
take job
  ↓
print something
```

But a real worker needs to know **what action to perform**.

Think of the queue as receiving different kinds of work:

```text
Queue
──────────────────────
send-email
send-notification
generate-report
resize-image
```

The worker needs a dispatcher:

```text
Job
 ↓
What type?
 ├── send-email        → email handler
 ├── send-notification → notification handler
 └── generate-report   → report handler
```

We can represent that very simply:

```ts
function processJob(job) {
  switch (job.type) {
    case "send-email":
      // send email
      break;

    case "send-notification":
      // send notification
      break;

    default:
      console.log("Unknown job type");
  }
}
```

Notice something important:

**The queue doesn't care what the job actually does.**

It only stores:

```ts
{
  type: "...",
  data: {...}
}
```

The **worker** decides how to process it.

---

# Step 5 — Now imagine multiple jobs

Suppose our application does:

```ts
addJob({
  type: "send-email",
  data: {
    to: "john@example.com"
  }
});

addJob({
  type: "send-notification",
  data: {
    to: "john@example.com"
  }
});
```

The queue becomes:

```text
┌──────────────────────────┐
│ send-email               │
├──────────────────────────┤
│ send-notification        │
└──────────────────────────┘
```

The worker processes them one at a time:

```text
Worker
  ↓
Job 1 → send email
  ↓
Job 2 → send notification
```

But here's a problem.

What if there are **10,000 jobs**?

One worker doing:

```text
Job 1
 ↓
Job 2
 ↓
Job 3
 ↓
...
Job 10,000
```

could take a long time.

So we introduce **multiple workers**.

```text
                 Queue
                   ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
     Worker 1   Worker 2   Worker 3
        ↓          ↓          ↓
      Job A      Job B      Job C
```

Now jobs can be processed concurrently.

---

# Step 6 — But what if a job fails?

This is where background jobs become much more interesting.

Suppose:

```text
Worker
  ↓
sendEmail()
  ↓
❌ Email provider unavailable
```

We don't necessarily want to throw the job away.

Instead:

```text
Job
 ↓
attempt 1 ❌
 ↓
retry
 ↓
attempt 2 ❌
 ↓
retry
 ↓
attempt 3 ✅
```

So a real job contains metadata such as:

```ts
{
  type: "send-email",

  data: {
    to: "john@example.com"
  },

  attempts: 0
}
```

The queue/worker system can manage:

* attempts
* retries
* delays
* failures
* completed jobs

---

## And here's the bigger picture

We're gradually building this:

```text
                     EVENTRA API
                         │
                         │ add job
                         ↓
                 ┌───────────────┐
                 │   JOB QUEUE   │
                 └───────┬───────┘
                         │
               ┌─────────┼─────────┐
               ↓         ↓         ↓
           Worker 1  Worker 2  Worker 3
               │         │         │
               ↓         ↓         ↓
            Email     Notify     Reports
               │
               ↓
        External services
```

And eventually, instead of our homemade:

```ts
const jobs = [];
```

we'll use **Redis + BullMQ**.

BullMQ will give us the machinery we've just been manually imagining:

```text
Queue
Workers
Retries
Concurrency
Delayed jobs
Job IDs
Job status
Failure handling
```

But because you've built the primitive version first, when you see:

```ts
queue.add("send-email", data);
```

you'll understand what's actually happening underneath.

---

### One final concept before we touch BullMQ

There is an important distinction between:

**"Do this later"**

and

**"Do this asynchronously."**

A background job can be:

```text
Immediate but asynchronous
```

or:

```text
Delayed until a specific time
```

For example, Eventra could create:

```text
Send confirmation email → immediately queued
```

but also:

```text
Send event reminder → 24 hours before event
```

The second one is a **delayed job**.

That's another major feature of job queues.

So we've now covered the core mechanics:

**Producer → Queue → Worker → Handler → Retry/Failure → Multiple Workers → Delayed Jobs.**

Next, we can take this exact mental model and build it with **Redis + BullMQ**, then plug it into your Eventra backend.

