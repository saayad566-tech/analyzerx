// Web / desktop (Electron) entry point.
//
// Same root component as the native entry (`index.js`); the difference is that the web runtime mounts
// through `AppRegistry.runApplication` against a DOM node instead of the native host.
import "react-native-gesture-handler";
import "react-native-reanimated";

import { AppRegistry } from "react-native";
import RootLayout from "./app/_layout";

AppRegistry.registerComponent("AnalyzerX", () => RootLayout);
AppRegistry.runApplication("AnalyzerX", {
  rootTag: document.getElementById("root"),
});
