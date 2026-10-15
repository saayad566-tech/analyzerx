package com.app.marketeventintelligence

import android.app.Application

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.app.marketeventintelligence.localai.AnalyzerXLocalAIPackage
import com.app.marketeventintelligence.localai.AnalyzerXLlamaCppPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // The Local AI native bridge is not autolinked; it is registered explicitly.
          add(AnalyzerXLlamaCppPackage())
          add(AnalyzerXLocalAIPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
