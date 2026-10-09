package com.app.marketeventintelligence.localai

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Optional llama.cpp boundary for checksum-pinned GGUF models.
 *
 * The native library is deliberately optional. Until AnalyzerX ships a reviewed,
 * arm64-built libanalyzerx_llama.so, every method reports unavailable instead of
 * claiming that Qwen/LFM can execute.
 */
class AnalyzerXLlamaCppModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var libraryLoaded = false
  private var modelLoaded = false

  override fun getName(): String = "AnalyzerXLlamaCpp"

  private fun ensureLibrary(): Boolean {
    if (libraryLoaded) return true
    return try {
      System.loadLibrary("analyzerx_llama")
      libraryLoaded = true
      true
    } catch (_: UnsatisfiedLinkError) {
      false
    }
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(ensureLibrary())
  }

  @ReactMethod
  fun load(modelPath: String, promise: Promise) {
    if (!ensureLibrary()) {
      promise.reject("LLAMA_CPP_UNAVAILABLE", "The arm64 llama.cpp JNI library is not included in this build.")
      return
    }
    executor.execute {
      try {
        nativeLoad(modelPath)
        modelLoaded = true
        promise.resolve(true)
      } catch (error: Throwable) {
        modelLoaded = false
        promise.reject("LLAMA_CPP_LOAD_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun stream(prompt: String, promise: Promise) {
    if (!modelLoaded) {
      promise.reject("LLAMA_CPP_NOT_LOADED", "Load a checksum-verified GGUF model before generating.")
      return
    }
    executor.execute {
      try {
        nativeStream(prompt)
        promise.resolve(true)
      } catch (error: Throwable) {
        promise.reject("LLAMA_CPP_GENERATION_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    if (!ensureLibrary() || !modelLoaded) {
      promise.resolve(false)
      return
    }
    executor.execute {
      nativeCancel()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun unload(promise: Promise) {
    if (!ensureLibrary() || !modelLoaded) {
      modelLoaded = false
      promise.resolve(true)
      return
    }
    executor.execute {
      try { nativeUnload() } finally {
        modelLoaded = false
        promise.resolve(true)
      }
    }
  }

  private external fun nativeLoad(modelPath: String)
  private external fun nativeStream(prompt: String)
  private external fun nativeCancel()
  private external fun nativeUnload()

  override fun invalidate() {
    if (modelLoaded && ensureLibrary()) runCatching { nativeUnload() }
    modelLoaded = false
    executor.shutdownNow()
    super.invalidate()
  }
}
