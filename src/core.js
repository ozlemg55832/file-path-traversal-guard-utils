import path from "node:path";
import fs from "node:fs";

/**
 * Normalize a path by lexically collapsing ".." and "." segments without
 * touching the filesystem. This is the first half of traversal defence:
 * it prevents "../" from hiding inside complex segment chains.
 *
 * We deliberately use path.posix under the hood so that the lexical result
 * is platform-independent, then convert separators back to the host form.
 * This keeps behaviour identical on Windows and POSIX callers.
 *
 * @param {string} input - Raw path from untrusted input.
 * @returns {string} Lexically normalized path using the host separator.
 * @throws {TypeError} If input is not a string.
 */
export function normalize(input) {
  if (typeof input !== "string") {
    throw new TypeError("input must be a string");
  }
  const posixForm = input.replace(/\\/g, "/");
  const normalizedPosix = path.posix.normalize(posixForm);
  return normalizedPosix.split("/").join(path.sep);
}

/**
 * Resolve `target` relative to `root` and guarantee the final real path
 * stays inside `root`.
 *
 * Security model (two layers):
 *
 * 1. Lexical pre-check. We normalize the relative input and reject any
 *    result that escapes root via dot-segments BEFORE touching the disk.
 *    This stops most trivial attacks even on systems where the root
 *    directory itself is a symlink to outside its nominal parent.
 *
 * 2. Realpath check. We fs.realpathSync the joined candidate and the root
 *    separately, then require the resolved target to equal the root or
 *    sit directly underneath it. Because realpath resolves symlinks, a
 *    symlink inside root that points outside will be caught here.
 *
 * Trade-off: realpathSync requires the path to exist on disk. This is
 * intentional — validating a non-existent path for "future safety" would
 * give a false guarantee the instant the file is created. Callers who need
 * to create a file safely should resolve a trusted parent directory with
 * this function, then append the final leaf component themselves and
 * create it with O_CREAT | O_EXCL semantics.
 *
 * @param {string} root - Absolute path to the containing directory.
 * @param {string} target - Path to validate, absolute or relative.
 * @returns {string} The realpath of target if it is safe.
 * @throws {Error} If target resolves outside root or either path is missing.
 * @throws {TypeError} If either argument is not a string.
 */
export function resolveWithin(root, target) {
  if (typeof root !== "string" || typeof target !== "string") {
    throw new TypeError("root and target must be strings");
  }

  const realRoot = fs.realpathSync(root);
  const rootSep = realRoot + path.sep;

  // Phase 1: lexical guard against dot-segment escape.
  // If target is relative we join it to realRoot first; if it is absolute
  // we still normalize so that redundant segments don't confuse the prefix
  // test below.
  const joined = path.isAbsolute(target)
    ? target
    : path.join(realRoot, target);
  const lex = normalize(joined);
  if (lex !== realRoot && !lex.startsWith(rootSep)) {
    throw new Error(
      `path traversal: lexical escape from root (${lex})`
    );
  }

  // Phase 2: realpath guard against symlink escape. The path must exist.
  const realTarget = fs.realpathSync(joined);
  if (realTarget !== realRoot && !realTarget.startsWith(rootSep)) {
    throw new Error(
      `path traversal: realpath escapes root (${realTarget})`
    );
  }
  return realTarget;
}

/**
 * Boolean wrapper around resolveWithin for callers that prefer a guard
 * predicate over exception handling.
 *
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
export function isPathSafe(root, target) {
  try {
    resolveWithin(root, target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Throw a descriptive Error if target is unsafe; otherwise return nothing.
 *
 * @param {string} root
 * @param {string} target
 * @returns {void}
 * @throws {Error} When the path is unsafe.
 */
export function assertPathSafe(root, target) {
  resolveWithin(root, target);
}
