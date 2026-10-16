package com.app.marketeventintelligence

import android.app.Application

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.app.marketeventintelligence.localai.AnalyzerXLocalAIPackage
import com.app.marketeventintelligence.localai.AnalyzerXLlamaCppPackage

/**
 * React Native 0.81's `ReactApplication` still declares `reactNativeHost` as an abstract member, so
 * it must be implemented here. The reactHost-only shape (where `reactHost` is the sole override)
 * belongs to React Native 0.83+ and does not compile against 0.81.
 */
class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // The Local AI native bridge is not autolinked; it is registered explicitly.
              add(AnalyzerXLlamaCppPackage())
              add(AnalyzerXLocalAIPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
