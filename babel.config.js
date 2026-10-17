/**
 * babel-preset-expo inlined `process.env.EXPO_PUBLIC_*` at build time. That preset is no longer used,
 * so the same inlining is done here — otherwise every `EXPO_PUBLIC_*` value is `undefined` at
 * runtime, which silently empties the OAuth configuration.
 */
function inlinePublicEnv() {
  const PUBLIC_PREFIX = "EXPO_PUBLIC_";
  // Snapshot the public environment once, at build time. Reading `process.env[<dynamic>]` is both
  // what the Expo lint rule forbids and unnecessary: the set of public variables is fixed for the
  // life of the build.
  const publicEnv = new Map(
    Object.entries(process.env).filter(
      ([key, value]) => key.startsWith(PUBLIC_PREFIX) && typeof value === "string",
    ),
  );
  return {
    name: "inline-expo-public-env",
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        const { object, property } = node;
        if (!object || object.type !== "MemberExpression") return;
        if (object.object?.type !== "Identifier" || object.object.name !== "process") return;
        if (object.property?.type !== "Identifier" || object.property.name !== "env") return;
        if (property.type !== "Identifier" || !property.name.startsWith(PUBLIC_PREFIX)) return;
        path.replaceWith({ type: "StringLiteral", value: publicEnv.get(property.name) ?? "" });
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["module:@react-native/babel-preset", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [inlinePublicEnv, "react-native-worklets/plugin"],
  };
};
