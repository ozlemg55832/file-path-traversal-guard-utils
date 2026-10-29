# file-path-traversal-guard-utils

A small, zero-dependency Node.js utility that validates a resolved file path stays within a designated root directory, rejecting both dot-segment (`../`) escapes and symlink escapes.

## Usage

```js
import { resolveWithin, isPathSafe, assertPathSafe, normalize } from "file-path-traversal-guard-utils";

// Create a real root directory for demonstration.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-uploads-"));
fs.mkdirSync(path.join(root, "user"));
fs.writeFileSync(path.join(root, "user", "notes.txt"), "hello");

// Throws if the realpath escapes root (dot-segment or symlink).
const safe = resolveWithin(root, "user/notes.txt");

// Boolean predicate for callers that prefer guards over try/catch.
if (isPathSafe(root, "user/notes.txt")) {
  // proceed
}

// Throw-and-return-nothing variant.
assertPathSafe(root, "user/notes.txt");

// Pure lexical normalize, no filesystem access.
const cleaned = normalize("a/b/../c"); // "a/c"
```

## Why this exists

When an application accepts a filename or relative path from untrusted input and joins it to a fixed root directory, two well-known classes of escape exist:

1. **Dot-segment escape** — `../` segments in the input walk above the root.
2. **Symlink escape** — an attacker plants a symlink inside the root that points outside it, so a `realpath` of the joined path resolves to a location beyond root.

This library defends against both. It performs a lexical normalization first (so trivial `../` chains are rejected without touching the disk) and then a `realpathSync` comparison against the resolved root (so symlinks are caught).

The trade-off: `resolveWithin` requires the target path to **already exist** on disk. Validating a path that does not exist yet would give a false guarantee the moment it is created. If you need to create a new file safely, resolve its parent directory with `resolveWithin`, then append a trusted leaf component and create it with `O_CREAT | O_EXCL`.

## Awkward edge

On Windows, paths use `\` as the separator. The `normalize` function converts backslashes to forward slashes internally before collapsing segments, so `a\\b\\..\\c` is treated identically on both platforms. `resolveWithin` uses the host's `path` module, so absolute Windows paths (e.g. `C:\\app\\uploads`) are supported.

## Exports

| Name              | Signature                                   | Returns        |
| ----------------- | ------------------------------------------- | -------------- |
| `normalize`       | `(input: string) => string`                 | Lexically normalized path. |
| `resolveWithin`   | `(root: string, target: string) => string`  | Realpath of target if safe; throws otherwise. |
| `isPathSafe`      | `(root: string, target: string) => boolean` | `true` if safe. |
| `assertPathSafe`  | `(root: string, target: string) => void`    | Throws if unsafe. |

No third-party dependencies. Node.js standard library only.
