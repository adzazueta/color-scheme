// Copied unchanged from color-extractor: scripts/tarball.mjs at commit
// 0df7864efcb37cac59a70205a8468c406e26b61a (ADZE-70). Both packages publish the same files. Its
// unit tests stay there (test/node/scripts/tarball.test.ts): they need Node.js types, which this
// repository does not have.
//
// Reads the entries of a .tgz with node: built-ins only (Node.js 22.12 compatible) and checks them
// against the allowlist of the published package (ADZE-70). It fails closed: anything it does not
// understand throws instead of being skipped.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const BLOCK = 512;

/** Text of a NUL-terminated header field. */
function field(block, offset, length) {
  const end = block.indexOf(0, offset);
  return block.toString(
    "utf8",
    offset,
    end === -1 || end > offset + length ? offset + length : end,
  );
}

/** Value of an octal header field. Base-256 (binary) values and anything else are rejected. */
function octal(block, offset, length, what) {
  const text = field(block, offset, length).trim();
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(`Invalid ${what} field in the tarball: "${text}".`);
  }
  return Number.parseInt(text, 8);
}

/** Parses the "<length> <key>=<value>\n" records of a pax extended header. */
function paxRecords(body) {
  const records = new Map();
  let position = 0;
  while (position < body.length) {
    const space = body.indexOf(0x20, position);
    const digits = space === -1 ? "" : body.toString("latin1", position, space);
    if (!/^[1-9][0-9]*$/.test(digits)) {
      throw new Error("Invalid pax record in the tarball.");
    }
    const length = Number.parseInt(digits, 10);
    const end = position + length;
    if (end > body.length || body[end - 1] !== 0x0a) {
      throw new Error("Invalid pax record in the tarball.");
    }
    const text = body.toString("utf8", space + 1, end - 1);
    const equals = text.indexOf("=");
    if (equals === -1) {
      throw new Error("Invalid pax record in the tarball.");
    }
    records.set(text.slice(0, equals), text.slice(equals + 1));
    position = end;
  }
  return records;
}

/**
 * Raw entries of a .tgz in archive order: { path, type: "file" | "directory" }.
 * Handles ustar name + prefix, pax "x" path records, and GNU "L" long names; skips pax "g" headers.
 * Throws on a bad gzip stream, a header checksum mismatch, a non-octal or base-256 size, a body past
 * the end, or any other entry type (symlinks "2", hard links "1", devices...).
 */
export function readTarballEntries(path) {
  const tar = gunzipSync(readFileSync(path));
  const entries = [];
  let offset = 0;
  let pendingName;
  while (offset < tar.length) {
    if (offset + BLOCK > tar.length) {
      throw new Error("The tarball ends in the middle of a header.");
    }
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) {
      break; // end-of-archive marker
    }
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) {
      sum += i >= 148 && i < 156 ? 32 : header[i];
    }
    if (sum !== octal(header, 148, 8, "checksum")) {
      throw new Error(`Bad tar header checksum at offset ${offset}.`);
    }
    const size = octal(header, 124, 12, "size");
    const bodyStart = offset + BLOCK;
    if (bodyStart + size > tar.length) {
      throw new Error("The tarball ends in the middle of an entry.");
    }
    const body = tar.subarray(bodyStart, bodyStart + size);
    const type = String.fromCharCode(header[156] === 0 ? 48 : header[156]);
    const prefix =
      header.toString("latin1", 257, 263) === "ustar\u0000" ? field(header, 345, 155) : "";
    const ownName = field(header, 0, 100);
    const name = pendingName ?? (prefix === "" ? ownName : `${prefix}/${ownName}`);

    if (type === "x") {
      const records = paxRecords(body);
      for (const key of records.keys()) {
        if (key === "size" || key === "linkpath") {
          throw new Error(`Unsupported pax record "${key}" in the tarball.`);
        }
      }
      pendingName = records.get("path") ?? pendingName;
    } else if (type === "L") {
      pendingName = body.toString("utf8").replace(/\0+$/, "");
    } else if (type === "g") {
      // Global pax headers carry no entry.
    } else if (type === "0" || type === "5") {
      entries.push({ path: name, type: type === "0" ? "file" : "directory" });
      pendingName = undefined;
    } else {
      throw new Error(`Unsupported entry type "${type}" for ${name} in the tarball.`);
    }
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK;
    if (offset > tar.length) {
      throw new Error("The tarball ends in the middle of an entry.");
    }
  }
  if (pendingName !== undefined) {
    throw new Error("The tarball ends after a long-name header without an entry.");
  }
  return entries;
}

/** The allowlist, relative to "package/": package.json, dist/**, README.md, LICENSE, CHANGELOG.md. */
export const TARBALL_ALLOWLIST = [
  "package.json",
  "dist/**",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
];

const ALLOWED_FILES = new Set(["package.json", "README.md", "LICENSE", "CHANGELOG.md"]);

/**
 * Entries outside the allowlist, as archive paths, in archive order. A path is outside when it does
 * not start with "package/", contains an empty, "." or ".." segment, starts with "/", or (files) matches
 * no allowlist entry. Directories are allowed only for "package/" and "package/dist/...".
 */
export function entriesOutsideAllowlist(entries) {
  const outside = [];
  for (const { path, type } of entries) {
    if (!isAllowed(path, type)) {
      outside.push(path);
    }
  }
  return outside;
}

function isAllowed(path, type) {
  if (!path.startsWith("package/")) {
    return false;
  }
  const relative = path.slice("package/".length);
  if (type === "directory") {
    // A directory may be written with a trailing slash.
    const trimmed = relative.endsWith("/") ? relative.slice(0, -1) : relative;
    if (trimmed === "") {
      return true;
    }
    const segments = trimmed.split("/");
    return segments.every(validSegment) && segments[0] === "dist";
  }
  const segments = relative.split("/");
  if (!segments.every(validSegment)) {
    return false;
  }
  return ALLOWED_FILES.has(relative) || (segments[0] === "dist" && segments.length > 1);
}

function validSegment(segment) {
  return segment !== "" && segment !== "." && segment !== "..";
}
