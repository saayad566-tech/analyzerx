/**
 * babel-preset-expo inlined `process.env.EXPO_PUBLIC_*` at build time. That preset is no longer used,
 * so the same inlining is done here — otherwise every `EXPO_PUBLIC_*` value is `undefined` at
 * runtime, which silently empties the OAuth configuration.
 */
function inlinePublicEnv() {
  const PUBLIC_PREFIX = "EXPO_PUBLIC_";
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
        const value = process.env[property.name];
        path.replaceWith({ type: "StringLiteral", value: typeof value === "string" ? value : "" });
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
