module.exports = function (api) {
  api.cache(true);
  return {
    // `babel-preset-expo` handled JSX/TS, the React Native transform and the NativeWind JSX import
    // source. The bare React Native preset covers the same ground; NativeWind's own preset supplies
    // its JSX import source and Tailwind integration.
    presets: [
      ["module:@react-native/babel-preset", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: ["react-native-worklets/plugin"],
  };
};
