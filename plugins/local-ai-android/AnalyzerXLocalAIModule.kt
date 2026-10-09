package com.app.marketeventintelligence.localai

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.net.Uri
import java.io.File
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.MessageCallback
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future

class AnalyzerXLocalAIModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var engine: Engine? = null
  private var conversation: com.google.ai.edge.litertlm.Conversation? = null
  private var activeJob: Future<*>? = null

  override fun getName(): String = "AnalyzerXLocalAI"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun getDeviceTelemetry(promise: Promise) {
    try {
      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo()
      activityManager?.getMemoryInfo(memoryInfo)
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && powerManager != null) {
        when (powerManager.currentThermalStatus) {
          PowerManager.THERMAL_STATUS_NONE -> "none"
          PowerManager.THERMAL_STATUS_LIGHT -> "light"
          PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
          PowerManager.THERMAL_STATUS_SEVERE -> "severe"
          PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
          PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
          PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
          else -> "unknown"
        }
      } else "unavailable"
      promise.resolve(Arguments.createMap().apply {
        putDouble("usedMemoryBytes", ((memoryInfo.totalMem - memoryInfo.availMem).coerceAtLeast(0L)).toDouble())
        putString("thermalStatus", thermalStatus)
      })
    } catch (error: Throwable) {
      promise.reject("LOCAL_AI_TELEMETRY_UNAVAILABLE", error.message, error)
    }
  }

  @ReactMethod
  fun load(modelPath: String, backendName: String, promise: Promise) {
    activeJob?.cancel(true)
    executor.execute {
      try {
        closeRuntime()
        val backend = when (backendName.lowercase()) {
          "gpu" -> Backend.GPU()
          "npu" -> Backend.NPU(nativeLibraryDir = context.applicationInfo.nativeLibraryDir)
          else -> Backend.CPU()
        }
        val config = EngineConfig(
          modelPath = resolveModelPath(modelPath),
          backend = backend,
          cacheDir = context.cacheDir.path,
        )
        val nextEngine = Engine(config)
        nextEngine.initialize()
        engine = nextEngine
        conversation = nextEngine.createConversation()
        promise.resolve(true)
      } catch (error: Throwable) {
        closeRuntime()
        promise.reject("LOCAL_AI_LOAD_FAILED", error.message, error)
      }
    }
  }

  private fun resolveModelPath(value: String): String {
    val raw = value.trim()
    if (raw.isBlank()) throw IllegalArgumentException("Choose a downloaded local model before loading it.")
    val file = try {
      val uri = Uri.parse(raw)
      if (uri.scheme.equals("file", ignoreCase = true)) {
        val path = uri.path?.takeIf { it.isNotBlank() }
          ?: throw IllegalArgumentException("The selected model location is invalid. Download the model again.")
        File(path)
      } else File(raw)
    } catch (_: Throwable) {
      throw IllegalArgumentException("The selected model location is invalid. Download the model again.")
    }
    if (!file.isFile || file.length() <= 0L) {
      throw IllegalStateException("The selected model file is not available on this device. Download it again.")
    }
    return file.canonicalPath
  }

  @ReactMethod
  fun stream(prompt: String, imagePath: String?, audioPath: String?, promise: Promise) {
    val activeConversation = conversation
    if (activeConversation == null) {
      promise.reject("LOCAL_AI_NOT_LOADED", "Load a verified .litertlm model before generating.")
      return
    }
    activeJob?.cancel(true)
    activeJob = executor.submit {
      try {
        val normalizedImagePath = imagePath?.removePrefix("file://")?.takeIf { it.isNotBlank() }
        val normalizedAudioPath = audioPath?.removePrefix("file://")?.takeIf { it.isNotBlank() }
        if (normalizedImagePath == null && normalizedAudioPath == null) {
          sendText(activeConversation, prompt, promise)
        } else {
          val contents = mutableListOf<Content>()
          normalizedImagePath?.let { contents.add(Content.ImageFile(it)) }
          normalizedAudioPath?.let { contents.add(Content.AudioFile(it)) }
          contents.add(Content.Text(prompt))
          sendContents(activeConversation, Contents.of(*contents.toTypedArray()), promise)
        }
      } catch (error: Throwable) {
        promise.reject("LOCAL_AI_GENERATION_FAILED", error.message, error)
      }
    }
  }

  private fun sendText(activeConversation: com.google.ai.edge.litertlm.Conversation, prompt: String, promise: Promise) {
    activeConversation.sendMessageAsync(prompt, callbackFor(promise))
  }

  private fun sendContents(activeConversation: com.google.ai.edge.litertlm.Conversation, contents: Contents, promise: Promise) {
    activeConversation.sendMessageAsync(contents, callbackFor(promise))
  }

  private fun callbackFor(promise: Promise): MessageCallback = object : MessageCallback {
    override fun onMessage(message: com.google.ai.edge.litertlm.Message) {
      val payload = Arguments.createMap().apply {
        putString("text", message.toString())
      }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AnalyzerXLocalAIToken", payload)
    }

    override fun onDone() {
      promise.resolve(true)
    }

    override fun onError(throwable: Throwable) {
      promise.reject("LOCAL_AI_GENERATION_FAILED", throwable.message, throwable)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    activeJob?.cancel(true)
    activeJob = null
    promise.resolve(true)
  }

  @ReactMethod
  fun unload(promise: Promise) {
    executor.execute {
      closeRuntime()
      promise.resolve(true)
    }
  }

  private fun closeRuntime() {
    try { conversation?.close() } catch (_: Throwable) {}
    conversation = null
    try { engine?.close() } catch (_: Throwable) {}
    engine = null
  }

  override fun invalidate() {
    closeRuntime()
    executor.shutdownNow()
    super.invalidate()
  }
}
