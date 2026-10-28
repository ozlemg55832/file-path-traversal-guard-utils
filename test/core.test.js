import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  isPathSafe,
  assertPathSafe,
  resolveWithin,
  normalize,
} from "../src/core.js";

/**
 * Build a temporary sandbox directory tree for each test. Returns the root
 * path and a cleanup callback. Using a fresh tmpdir per test keeps the
 * suite deterministic and independent of ambient filesystem state.
 */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fptg-"));
  const insideDir = path.join(root, "inside");
  const insideFile = path.join(insideDir, "file.txt");
  fs.mkdirSync(insideDir);
  fs.writeFileSync(insideFile, "data");

  const siblingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fptg-sib-"));
  const siblingFile = path.join(siblingRoot, "secret.txt");
  fs.writeFileSync(siblingFile, "top secret");

  // A symlink that lives inside root but points at a file outside root.
  const escapeLink = path.join(insideDir, "escapeLink");
  fs.symlinkSync(siblingFile, escapeLink);

  // A symlink that lives inside root and points to another path inside root.
  const safeLink = path.join(insideDir, "safeLink");
  fs.symlinkSync(insideFile, safeLink);

  return {
    root,
    insideDir,
    insideFile,
    escapeLink,
    safeLink,
    siblingRoot,
    siblingFile,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(siblingRoot, { recursive: true, force: true });
    },
  };
}

test("normalize collapses dot segments", () => {
  assert.equal(normalize("a/b/../c"), path.join("a", "c"));
  assert.equal(normalize("./x/./y"), path.join("x", "y"));
  assert.equal(normalize("a/../../b"), path.join("..", "b"));
});

test("normalize converts backslashes to platform separators", () => {
  // On POSIX this turns \\ into /; on Windows it stays \\. Either way
  // the lexical collapse should treat the input as a single path.
  const got = normalize("a\\b\\..\\c");
  assert.equal(got, path.join("a", "c"));
});

test("normalize rejects non-string input", () => {
  assert.throws(() => normalize(42), TypeError);
});

test("resolveWithin accepts a file inside root", () => {
  const s = makeSandbox();
  try {
    const got = resolveWithin(s.root, "inside/file.txt");
    assert.equal(got, s.insideFile);
  } finally {
    s.cleanup();
  }
});

test("resolveWithin accepts root itself", () => {
  const s = makeSandbox();
  try {
    const got = resolveWithin(s.root, ".");
    assert.equal(got, s.root);
  } finally {
    s.cleanup();
  }
});

test("resolveWithin follows a safe internal symlink", () => {
  const s = makeSandbox();
  try {
    const got = resolveWithin(s.root, "inside/safeLink");
    assert.equal(got, s.insideFile);
  } finally {
    s.cleanup();
  }
});

test("resolveWithin rejects a dot-segment escape", () => {
  const s = makeSandbox();
  try {
    assert.throws(
      () => resolveWithin(s.root, "inside/../../" + path.basename(s.siblingRoot) + "/secret.txt"),
      /traversal/
    );
  } finally {
    s.cleanup();
  }
});

test("resolveWithin rejects a symlink that escapes root", () => {
  const s = makeSandbox();
  try {
    assert.throws(
      () => resolveWithin(s.root, "inside/escapeLink"),
      /traversal/
    );
  } finally {
    s.cleanup();
  }
});

test("resolveWithin rejects an absolute path outside root", () => {
  const s = makeSandbox();
  try {
    assert.throws(
      () => resolveWithin(s.root, s.siblingFile),
      /traversal/
    );
  } finally {
    s.cleanup();
  }
});

test("resolveWithin rejects non-existent target", () => {
  const s = makeSandbox();
  try {
    assert.throws(
      () => resolveWithin(s.root, "inside/nope.txt"),
      Error
    );
  } finally {
    s.cleanup();
  }
});

test("isPathSafe returns true for safe, false for unsafe", () => {
  const s = makeSandbox();
  try {
    assert.equal(isPathSafe(s.root, "inside/file.txt"), true);
    assert.equal(isPathSafe(s.root, "inside/escapeLink"), false);
    assert.equal(isPathSafe(s.root, "../../etc/passwd"), false);
    assert.equal(isPathSafe(s.root, 123), false);
  } finally {
    s.cleanup();
  }
});

test("assertPathSafe throws on unsafe, returns undefined on safe", () => {
  const s = makeSandbox();
  try {
    assert.equal(assertPathSafe(s.root, "inside/file.txt"), undefined);
    assert.throws(() => assertPathSafe(s.root, "inside/escapeLink"), /traversal/);
  } finally {
    s.cleanup();
  }
});

test("resolveWithin rejects non-string arguments", () => {
  const s = makeSandbox();
  try {
    assert.throws(() => resolveWithin(null, "x"), TypeError);
    assert.throws(() => resolveWithin(s.root, null), TypeError);
  } finally {
    s.cleanup();
  }
});
