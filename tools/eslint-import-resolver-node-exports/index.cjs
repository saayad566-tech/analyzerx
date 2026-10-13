/*
 * eslint-import-resolver-node-exports
 *
 * eslint-import-resolver-node (0.3.9) resolves a bare specifier to a literal
 * path on disk and does not follow a package's `exports` map. Packages such as
 * `@modelcontextprotocol/sdk` expose their entry points only through `exports`
 * (e.g. "./client/stdio.js" -> "./dist/cjs/client/stdio.js"), so the Node
 * resolver reports them as unresolved even though Node and TypeScript both
 * resolve them.
 *
 * This resolver simply delegates to Node's own resolver (`require.resolve`),
 * which honours `exports`. It handles bare (package) specifiers only and defers
 * relative and absolute specifiers to the other configured resolvers, so it
 * changes nothing about how the rest of the tree resolves.
 */

const path = require("path");

exports.interfaceVersion = 2;

exports.resolve = function resolve(source, file, _config) {
  // Only bare specifiers (package names / subpaths). Defer everything else.
  const isBare = !source.startsWith(".") && !path.isAbsolute(source);
  if (!isBare) return { found: false };

  try {
    const resolved = require.resolve(source, { paths: [path.dirname(file)] });
    return { found: true, path: resolved };
  } catch {
    return { found: false };
  }
};
