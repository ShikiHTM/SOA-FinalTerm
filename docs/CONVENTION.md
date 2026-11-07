# Convention

This document is the contract for coding convention, requires each members to follow strictly

> [!NOTE]
> I don't care how you write your code or how you manage them, what I need is an discipline codebase.

## File Construct

Since this project is a monorepo, project structure should be presetted as follow example:

```
services
├── user-service
├── group-service
└── submission-service
    └── src
        └── index.ts
```

You're forbidden to touch whatever not in your scope (e.g., Your works is in group service but you changes the whole fucking codebase of submission service)

## Naming convention

for `Typescript`:

| Type                              | Convention       |
| :-------------------------------- | :--------------- |
| Variable                          | camelCase        |
| Class, Component, Interface, Type | PascalCase       |
| Constant                          | UPPER_SNAKE_CASE |

## Format

Please ensure your codebase with those format:

- Indent: 4 (USING SPACAE).
- Please add ";" at EOL, its useful than you think.
- Always specify a variable type whenever you declare it.

Please treat your code as your lover. Do this:

```ts
class Foo{
  foo: int;

  constructor(Foo f) {
    // ...
  };
}
```

Instead of this:

```ts
class Foo{ foo: int; constructor(Foo f) { /* ... */}; }
```

---

That it, please do not abuse your codebase for a better world. Thank you
