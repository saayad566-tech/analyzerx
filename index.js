// The JavaScript entry point.
//
// The Expo runtime loaded `.expo/.virtual-metro-entry`; a bare React Native app registers its root
// component directly. `app/_layout.tsx` remains the root, now mounting the React Navigation tree.
//
// `react-native-gesture-handler` MUST be the first import in the entry file. It installs the native
// gesture handler before the React Native runtime mounts; importing only `GestureHandlerRootView`
// inside a component is too late and the app throws on launch.
import "react-native-gesture-handler";
// Reanimated must also initialise before the component tree; its Babel plugin is configured in
// babel.config.js.
import "react-native-reanimated";

import { AppRegistry } from "react-native";
import RootLayout from "./app/_layout";

AppRegistry.registerComponent("AnalyzerX", () => RootLayout);
