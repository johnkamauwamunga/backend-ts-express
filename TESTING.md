Yes — you're remembering correctly. 👍

The **three common levels/types of testing** we discussed were:

1. **Unit testing** — test a small isolated piece of code.

   ```text
   function → test
   service method → test
   utility → test
   ```

2. **Integration testing** — test that **multiple pieces work together**.

   ```text
   Controller
       ↓
   Service
       ↓
   Database
   ```

3. **End-to-End (E2E) testing** — test the application from the outside, like a real user/client.

   ```text
   HTTP request
       ↓
   Route
       ↓
   Middleware
       ↓
   Controller
       ↓
   Service
       ↓
   Database
       ↓
   HTTP response
   ```

So the missing one was **integration testing**.

---

## And yesterday we were building our own testing machinery

We had:

```js
const test = (name, fn) => {
  try {
    fn();

    console.log(`PASS: ${name}`);
  } catch (e) {
    console.log(`FAIL: ${name}`);
  }
};
```

The important idea:

```text
test()
   ↓
runs fn()
   ↓
test executes
   ↓
expect()
   ↓
assertion
   ↓
PASS or throws → FAIL
```

Then we built:

```js
const expect = (actual) => {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(
          `Expected ${expected}, received ${actual}`
        );
      }
    },

    toEqual: (expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected objects to be equal`);
      }
    }
  };
};
```

So now you understand the fundamental relationship:

```text
test()
     ↓
   RUNNER

expect()
     ↓
 ASSERTION SYSTEM

toBe()
toEqual()
     ↓
   MATCHERS
```

### Where I'd take you next

Before jumping into Jest/Vitest, let's **finish understanding what a testing framework is actually doing**.

I'd go:

**1. More matchers**
`toBeTruthy`, `toBeFalsy`, `toContain`, `toThrow`

**2. Better failure messages**

**3. Multiple tests + test suites**

**4. Testing errors**

**5. Async testing** ← **very important for backend**

```js
const user = await userService.createUser(...)
```

**6. Mocking**

This is where backend testing gets really interesting:

```text
UserService
    ↓
needs database
    ↓
instead of hitting real DB
    ↓
replace DB with a mock
```

**7. Then use a real framework such as Vitest/Jest**

And after that:

```text
Unit testing
     ↓
Integration testing
     ↓
E2E testing
```

Great. Let's continue **slowly**, and keep the same approach: understand the mechanism first, then we'll use a framework later.

## Next: more matchers

We currently have:

```js
expect(actual).toBe(expected);
expect(actual).toEqual(expected);
```

A matcher is simply a **specific question we want to ask about a value**.

For example:

```text
toBe()        → Are these exactly equal?
toEqual()     → Do these contain equal data?
toBeTruthy()  → Is this value truthy?
toBeFalsy()   → Is this value falsy?
toContain()   → Does this contain something?
toThrow()     → Does this function throw an error?
```

Let's take them **one at a time**.

---

# 1. `toBeTruthy()`

Suppose we have:

```js
const isLoggedIn = true;
```

We could write:

```js
expect(isLoggedIn).toBe(true);
```

But sometimes we don't care whether the value is specifically `true`.

We care whether JavaScript considers the value **truthy**.

For example:

```js
expect("hello").toBeTruthy();
expect(123).toBeTruthy();
expect(true).toBeTruthy();
```

All three should pass.

Because JavaScript considers them truthy.

But:

```js
expect(false).toBeTruthy();
expect(0).toBeTruthy();
expect("").toBeTruthy();
expect(null).toBeTruthy();
```

should fail.

---

## Let's build it

Our `expect()` currently looks like:

```js
const expect = (actual) => {
  return {
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(
          `Expected ${expected}, received ${actual}`
        );
      }
    },

    toEqual: (expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected objects to be equal`);
      }
    }
  };
};
```

We want to add:

```js
toBeTruthy: () => {
   // ...
}
```

Think about what JavaScript gives us.

We can convert any value into a boolean with:

```js
Boolean(actual)
```

So:

```js
Boolean("hello") // true
Boolean(0)       // false
Boolean(false)   // false
Boolean(123)     // true
```

Therefore, our matcher needs to throw when:

```text
Boolean(actual) === false
```

### Your turn

Try writing:

```js
toBeTruthy: () => {
    if (____________________) {
        throw new Error("Expected value to be truthy");
    }
}
```

Don't worry about getting it perfect.

