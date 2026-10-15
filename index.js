// The JavaScript entry point.
//
// The Expo runtime loaded `.expo/.virtual-metro-entry`; a bare React Native app registers its root
// component directly. `app/_layout.tsx` remains the root, now mounting the React Navigation tree.
import { AppRegistry } from "react-native";
import RootLayout from "./app/_layout";

AppRegistry.registerComponent("AnalyzerX", () => RootLayout);
