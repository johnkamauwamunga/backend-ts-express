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

