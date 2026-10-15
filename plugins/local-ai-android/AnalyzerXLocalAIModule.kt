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
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.MessageCallback
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future

class AnalyzerXLocalAIModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var engine: Engine? = null
  // The conversation is created per request. LiteRT's Conversation is a
  // stateful chat session whose rendered template must strictly extend the
  // previous one; the JS layer sends a complete prompt each turn, so reusing a
  // conversation across turns fails with "INTERNAL: The new rendered template
  // string does not start with the previous rendered template string."
  private var activeConversation: com.google.ai.edge.litertlm.Conversation? = null
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
        // Smoke-test that a conversation can be created for this model, then
        // release it: every request opens its own.
        try {
          nextEngine.createConversation().close()
        } catch (_: Throwable) {
          // A model that loads but cannot open a conversation is still usable
          // for the engine-level checks above; the per-request open below will
          // surface a precise error if it fails.
        }
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

  /**
   * Compute the SHA-256 of a downloaded artifact so the JS layer can verify it
   * against the manifest pin. Runs on the background executor because hashing a
   * ~500 MB model must never block the UI thread. Resolves null (rather than
   * rejecting) when the file is absent, so the caller can report
   * "size-verified only" honestly.
   */
  @ReactMethod
  fun sha256(fileUri: String, promise: Promise) {
    executor.execute {
      try {
        val raw = fileUri.trim()
        if (raw.isBlank()) {
          promise.resolve(null as String?)
          return@execute
        }
        val file = try {
          val uri = Uri.parse(raw)
          if (uri.scheme.equals("file", ignoreCase = true)) File(uri.path ?: "") else File(raw)
        } catch (_: Throwable) {
          File("")
        }
        if (!file.isFile || file.length() <= 0L) {
          promise.resolve(null as String?)
          return@execute
        }
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream ->
          val buffer = ByteArray(1 shl 16)
          while (true) {
            val read = stream.read(buffer)
            if (read <= 0) break
            digest.update(buffer, 0, read)
          }
        }
        promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
      } catch (error: Throwable) {
        promise.reject("sha256_failed", error)
      }
    }
  }

  @ReactMethod
  fun stream(systemInstruction: String?, prompt: String, imagePath: String?, audioPath: String?, promise: Promise) {
    val activeEngine = engine
    if (activeEngine == null) {
      promise.reject("LOCAL_AI_NOT_LOADED", "Load a verified .litertlm model before generating.")
      return
    }
    activeJob?.cancel(true)
    activeJob = executor.submit {
      // One conversation per request. The prompt already carries the system
      // preamble, the question and the verified context, so each turn must be
      // independent of the last.
      // The system instruction is attached to the conversation itself rather
      // than repeated inside every user message. LiteRT renders each turn
      // against the conversation template and requires that rendered template
      // to strictly extend the previous one, so a repeated preamble made the
      // second turn of a session fail with:
      //   INTERNAL: The new rendered template string does not start with the
      //   previous rendered template string.
      // Close any conversation still open from a previous request first: two
      // live conversations on one engine share the template renderer, which
      // triggers the same INTERNAL template error.
      closeConversation(activeConversation)
      val requestConversation = try {
        val instruction = systemInstruction?.takeIf { it.isNotBlank() }
        if (instruction != null) {
          activeEngine.createConversation(
            ConversationConfig(systemInstruction = Contents.of(Content.Text(instruction))),
          )
        } else {
          activeEngine.createConversation()
        }
      } catch (error: Throwable) {
        promise.reject("LOCAL_AI_GENERATION_FAILED", error.message, error)
        null
      }
      if (requestConversation != null) {
        activeConversation = requestConversation
        try {
          val normalizedImagePath = imagePath?.removePrefix("file://")?.takeIf { it.isNotBlank() }
          val normalizedAudioPath = audioPath?.removePrefix("file://")?.takeIf { it.isNotBlank() }
          if (normalizedImagePath == null && normalizedAudioPath == null) {
            sendText(requestConversation, prompt, promise)
          } else {
            val contents = mutableListOf<Content>()
            normalizedImagePath?.let { contents.add(Content.ImageFile(it)) }
            normalizedAudioPath?.let { contents.add(Content.AudioFile(it)) }
            contents.add(Content.Text(prompt))
            sendContents(requestConversation, Contents.of(*contents.toTypedArray()), promise)
          }
        } catch (error: Throwable) {
          closeConversation(requestConversation)
          promise.reject("LOCAL_AI_GENERATION_FAILED", error.message, error)
        }
      }
    }
  }

  private fun sendText(target: com.google.ai.edge.litertlm.Conversation, prompt: String, promise: Promise) {
    target.sendMessageAsync(prompt, callbackFor(promise, target))
  }

  private fun sendContents(target: com.google.ai.edge.litertlm.Conversation, contents: Contents, promise: Promise) {
    target.sendMessageAsync(contents, callbackFor(promise, target))
  }

  private fun closeConversation(target: com.google.ai.edge.litertlm.Conversation?) {
    if (target == null) return
    try { target.close() } catch (_: Throwable) {}
    if (activeConversation === target) activeConversation = null
  }

  private fun callbackFor(promise: Promise, target: com.google.ai.edge.litertlm.Conversation): MessageCallback = object : MessageCallback {
    override fun onMessage(message: com.google.ai.edge.litertlm.Message) {
      // The reply text lives in the message contents, not in toString().
      // Emitting toString() sent a data-class dump to JS, so the model looked
      // like it was streaming while never producing readable text.
      val text = message.contents.contents
        .filterIsInstance<Content.Text>()
        .joinToString("") { it.text }
      if (text.isEmpty()) return
      val payload = Arguments.createMap().apply {
        putString("text", text)
      }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AnalyzerXLocalAIToken", payload)
    }

    override fun onDone() {
      // Release this request's conversation so the next turn starts clean.
      closeConversation(target)
      promise.resolve(true)
    }

    override fun onError(throwable: Throwable) {
      closeConversation(target)
      promise.reject("LOCAL_AI_GENERATION_FAILED", throwable.message, throwable)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    activeJob?.cancel(true)
    activeJob = null
    closeConversation(activeConversation)
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
    closeConversation(activeConversation)
    try { engine?.close() } catch (_: Throwable) {}
    engine = null
  }

  override fun invalidate() {
    closeRuntime()
    executor.shutdownNow()
    super.invalidate()
  }
}
