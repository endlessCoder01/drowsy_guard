@file:Suppress("DEPRECATION", "MissingPermission")

package com.drowsyguard.drive

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioAttributes
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Parcel
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class DriveModeModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {

  private val handler = Handler(Looper.getMainLooper())
  private val manager = context.getSystemService(NotificationManager::class.java)
  private val audio = context.getSystemService(AudioManager::class.java)
  private val adapter get() = context.getSystemService(BluetoothManager::class.java)?.adapter
  private var headset: BluetoothHeadset? = null
  private var profileRequested = false
  private var sessionActive = false
  @Volatile private var sessionGeneration = 0L
  private var quietRequested = false
  private var focusActive = false
  private var focusStateConfirmed = Build.VERSION.SDK_INT >= 35
  private var bluetoothConnected = false
  private var reason: String? = null
  private var cleanupPending = false
  private var bound = false
  private var connection: ServiceConnection? = null
  private var service: IBinder? = null
  private var startPromise: Promise? = null
  private val lease = Binder()
  private var listeners = 0
  private var windowActivity: Activity? = null
  private var savedSystemUi = 0
  private var savedKeepAwake = false
  private var savedStatusBarVisible = true
  private var savedNavigationBarVisible = true
  private var savedSystemBarsBehavior = 0
  private var receiverRegistered = false
  private var disposed = false

  override fun getName() = "DrowsyGuardDriveMode"

  private val profileListener = object : BluetoothProfile.ServiceListener {
    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
      handler.post {
        if (disposed) {
          runCatching { adapter?.closeProfileProxy(profile, proxy) }
          return@post
        }
        if (profile == BluetoothProfile.HEADSET) headset = proxy as BluetoothHeadset
        refreshBluetooth()
      }
    }
    override fun onServiceDisconnected(profile: Int) {
      handler.post {
        if (profile == BluetoothProfile.HEADSET) {
          headset = null
          profileRequested = false
          // Fail closed while the Bluetooth service is unavailable.
          bluetoothConnected = false
          updateFocusPolicy()
          emitStatus()
        }
      }
    }
  }

  private val audioCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(devices: Array<out AudioDeviceInfo>) = refreshBluetooth()
    override fun onAudioDevicesRemoved(devices: Array<out AudioDeviceInfo>) = refreshBluetooth()
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (disposed) return
      if (!manager.isNotificationPolicyAccessGranted && quietRequested) {
        stopSession()
        reason = "Do Not Disturb access was removed"
      }
      refreshBluetooth()
    }
  }

  private fun sessionConnection(generation: Long) = object : ServiceConnection {
    private fun isCurrentSession() = generation == sessionGeneration && connection === this && !disposed

    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      handler.post {
        // A queued callback from a cancelled bind must not attach to a new start.
        if (!isCurrentSession() || !sessionActive || !quietRequested) return@post
        service = binder
        try {
          transact(DriveConditionService.CONFIGURE)
          startPromise?.resolve(status())
          startPromise = null
          emitStatus()
        } catch (error: Exception) {
          failStart("E_FOCUS_START", error)
        }
      }
    }
    override fun onServiceDisconnected(name: ComponentName?) {
      handler.post {
        if (!isCurrentSession()) return@post
        service = null
        focusActive = false
        reason = "Drive focus service disconnected; monitoring stopped"
        stopSession()
        emitStatus()
      }
    }
    override fun onBindingDied(name: ComponentName?) = onServiceDisconnected(name)
    override fun onNullBinding(name: ComponentName?) {
      handler.post {
        if (isCurrentSession()) failStart("E_FOCUS_START", IllegalStateException("Drive focus could not connect"))
      }
    }
  }

  override fun initialize() {
    super.initialize()
    context.addLifecycleEventListener(this)
    handler.post {
      // A new JS runtime cannot inherit an old monitoring session.
      runCatching { DriveConditionService.removeOwnedRules(context) }
      val filter = IntentFilter().apply {
        addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
        addAction(BluetoothHeadset.ACTION_AUDIO_STATE_CHANGED)
        addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
        addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
        addAction(NotificationManager.ACTION_NOTIFICATION_POLICY_ACCESS_GRANTED_CHANGED)
        addAction(NotificationManager.ACTION_INTERRUPTION_FILTER_CHANGED)
        addAction(NotificationManager.ACTION_NOTIFICATION_POLICY_CHANGED)
        if (Build.VERSION.SDK_INT >= 30) addAction(NotificationManager.ACTION_AUTOMATIC_ZEN_RULE_STATUS_CHANGED)
      }
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
      receiverRegistered = true
      audio.registerAudioDeviceCallback(audioCallback, handler)
      refreshBluetooth()
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    handler.post {
      refreshBluetooth()
      runCatching { if (service != null) transact(DriveConditionService.STATUS) }
        .onFailure { focusActive = false; reason = it.message }
      promise.resolve(status())
    }
  }

  @ReactMethod
  fun openNotificationPolicySettings(promise: Promise) {
    handler.post {
      try {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(status())
      } catch (error: Exception) {
        promise.reject("E_POLICY_SETTINGS", "Android Do Not Disturb settings could not open", error)
      }
    }
  }

  @ReactMethod
  fun start(enableQuiet: Boolean, promise: Promise) {
    handler.post {
      if (enableQuiet && Build.VERSION.SDK_INT < 29) {
        promise.reject("E_FOCUS_UNSUPPORTED", "Drive focus requires Android 10 or later")
        return@post
      }
      if (enableQuiet && !manager.isNotificationPolicyAccessGranted) {
        promise.reject("E_POLICY_ACCESS", "Allow DrowsyGuard Do Not Disturb access in Android Settings")
        return@post
      }
      val activity = currentActivity
      if (activity == null || activity.isFinishing || activity.isDestroyed) {
        promise.reject("E_NO_ACTIVITY", "Open DrowsyGuard before starting monitoring")
        return@post
      }
      val cleanupError = stopSession()
      if (cleanupError != null) {
        promise.reject("E_FOCUS_STOP", cleanupError.message, cleanupError)
        emitStatus()
        return@post
      }
      reason = null
      sessionActive = true
      quietRequested = enableQuiet
      applyFullscreen(activity)
      refreshBluetooth()
      if (!enableQuiet) {
        promise.resolve(status())
        emitStatus()
        return@post
      }
      startPromise = promise
      try {
        val currentConnection = sessionConnection(sessionGeneration)
        connection = currentConnection
        bound = context.bindService(
          Intent(context, DriveConditionService::class.java).setAction(DriveConditionService.SESSION_ACTION),
          currentConnection, Context.BIND_AUTO_CREATE,
        )
        check(bound) { "Android did not bind drive focus" }
        // A failed or stalled binder must never leave a pending start forever.
        handler.postDelayed({
          if (startPromise === promise) failStart("E_FOCUS_TIMEOUT", IllegalStateException("Drive focus timed out"))
        }, 8000)
      } catch (error: Exception) {
        failStart("E_FOCUS_START", error)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    handler.post {
      val cleanupError = stopSession()
      emitStatus()
      if (cleanupError == null) promise.resolve(status())
      else promise.reject("E_FOCUS_STOP", cleanupError.message, cleanupError)
    }
  }

  // Match the foreground spoken warning's media usage so our own safety cue can
  // accompany speech while notification vibrations are blocked by drive focus.
  @ReactMethod
  fun vibrateAlert(pattern: ReadableArray, promise: Promise) {
    val generation = sessionGeneration
    handler.post {
      try {
        // Permit the idle test-alert button, but drop work queued before a stop.
        if (generation != sessionGeneration || disposed) {
          promise.resolve(null)
          return@post
        }
        val vibrator = context.getSystemService(Vibrator::class.java)
        require(pattern.size() in 2..32) { "Invalid alert vibration pattern" }
        val timings = LongArray(pattern.size()) { index ->
          val duration = pattern.getDouble(index)
          require(duration.isFinite() && duration >= 0 && duration <= 5000) { "Invalid vibration duration" }
          duration.toLong()
        }
        require(timings.sum() in 1..30000) { "Invalid alert vibration duration" }
        val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build()
        if (Build.VERSION.SDK_INT >= 33) {
          vibrator.vibrate(VibrationEffect.createWaveform(timings, -1), VibrationAttributes.Builder().setUsage(VibrationAttributes.USAGE_MEDIA).build())
        } else if (Build.VERSION.SDK_INT >= 26) {
          vibrator.vibrate(VibrationEffect.createWaveform(timings, -1), attributes)
        } else {
          vibrator.vibrate(timings, -1, attributes)
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("E_ALERT_VIBRATION", "Alert vibration could not play", error)
      }
    }
  }

  @ReactMethod
  fun cancelAlertVibration() {
    handler.post { context.getSystemService(Vibrator::class.java).cancel() }
  }

  @ReactMethod
  fun addListener(eventName: String) { handler.post { listeners += 1 } }

  @ReactMethod
  fun removeListeners(count: Double) { handler.post { listeners = (listeners - count.toInt()).coerceAtLeast(0) } }

  private fun bluetoothPermissionGranted() = Build.VERSION.SDK_INT < 31 ||
    context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  private fun isCallBluetooth(device: AudioDeviceInfo) = device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
    (Build.VERSION.SDK_INT >= 31 && device.type == AudioDeviceInfo.TYPE_BLE_HEADSET)

  private fun refreshBluetooth() {
    if (disposed) return
    val oldConnected = bluetoothConnected
    bluetoothConnected = false
    if (bluetoothPermissionGranted()) {
      try {
        if (!profileRequested) {
          profileRequested = adapter?.getProfileProxy(context, profileListener, BluetoothProfile.HEADSET) == true
        }
        val hfpConnected = headset?.connectedDevices?.isNotEmpty() == true
        val communicationConnected = if (Build.VERSION.SDK_INT >= 31) {
          audio.availableCommunicationDevices.any(::isCallBluetooth)
        } else {
          audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any(::isCallBluetooth)
        }
        bluetoothConnected = hfpConnected || communicationConnected
      } catch (_: SecurityException) {
        bluetoothConnected = false
      } catch (_: RuntimeException) {
        bluetoothConnected = false
      }
    }
    if (oldConnected != bluetoothConnected) updateFocusPolicy()
    runCatching { if (service != null) transact(DriveConditionService.STATUS) }
      .onFailure { focusActive = false; reason = it.message }
    emitStatus()
  }

  private fun updateFocusPolicy() {
    if (sessionActive && quietRequested && service != null) {
      try {
        transact(DriveConditionService.CONFIGURE)
        reason = null
      } catch (error: Exception) {
        // Do not keep a calls-allowed policy if the headset disconnected and updating failed.
        val cleanupError = stopSession()
        reason = cleanupError?.message ?: "Drive focus stopped: ${error.message ?: "Bluetooth policy could not update"}"
      }
    }
  }

  private fun transact(code: Int) {
    val binder = service ?: error("Drive focus is not connected")
    val data = Parcel.obtain()
    val reply = Parcel.obtain()
    try {
      data.writeInterfaceToken(DriveConditionService.DESCRIPTOR)
      if (code == DriveConditionService.CONFIGURE) {
        data.writeStrongBinder(lease)
        data.writeInt(if (bluetoothConnected) 1 else 0)
      }
      check(binder.transact(code, data, reply, 0)) { "Drive focus rejected the request" }
      reply.readException()
      focusActive = reply.readInt() != 0
      focusStateConfirmed = reply.readInt() != 0
    } finally {
      data.recycle()
      reply.recycle()
    }
  }

  private fun applyFullscreen(activity: Activity) {
    windowActivity = activity
    val window = activity.window
    savedSystemUi = window.decorView.systemUiVisibility
    savedKeepAwake = window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= 30) {
      val insets = window.decorView.rootWindowInsets
      savedStatusBarVisible = insets?.isVisible(WindowInsets.Type.statusBars())
        ?: (savedSystemUi and View.SYSTEM_UI_FLAG_FULLSCREEN == 0)
      savedNavigationBarVisible = insets?.isVisible(WindowInsets.Type.navigationBars())
        ?: (savedSystemUi and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION == 0)
      window.insetsController?.apply {
        savedSystemBarsBehavior = systemBarsBehavior
        systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        hide(WindowInsets.Type.systemBars())
      }
    } else {
      window.decorView.systemUiVisibility = savedSystemUi or
        View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
  }

  private fun stopSession(): Exception? {
    sessionGeneration += 1
    startPromise?.reject("E_SESSION_CANCELLED", "Monitoring stopped before drive focus was ready")
    startPromise = null
    sessionActive = false
    quietRequested = false
    context.getSystemService(Vibrator::class.java).cancel()
    runCatching { if (service != null) transact(DriveConditionService.STOP) }
    releaseService()
    val removalError = runCatching { DriveConditionService.removeOwnedRules(context) }.exceptionOrNull()
    // Confirm the actual rule state before reporting restoration. Another process
    // may have completed removal even if its Binder disconnected during STOP.
    val verificationError = runCatching {
      if (manager.isNotificationPolicyAccessGranted) {
        check(DriveConditionService.ownedRuleIds(context).isEmpty()) { "An owned drive focus rule remains" }
      }
    }.exceptionOrNull()
    val cleanupError = if (verificationError != null && manager.isNotificationPolicyAccessGranted) {
      IllegalStateException("Drive focus cleanup could not be confirmed. Check Android Do Not Disturb settings.", removalError ?: verificationError)
    } else null
    if (cleanupError == null && cleanupPending) reason = null
    cleanupPending = cleanupError != null
    if (cleanupError != null) {
      reason = cleanupError.message
      Log.w("DrowsyGuardDriveMode", reason, cleanupError)
    }
    focusActive = false
    windowActivity?.let { activity ->
      if (!activity.isDestroyed) {
        if (!savedKeepAwake) activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        activity.window.decorView.systemUiVisibility = savedSystemUi
        if (Build.VERSION.SDK_INT >= 30) activity.window.insetsController?.apply {
          systemBarsBehavior = savedSystemBarsBehavior
          if (savedStatusBarVisible) show(WindowInsets.Type.statusBars()) else hide(WindowInsets.Type.statusBars())
          if (savedNavigationBarVisible) show(WindowInsets.Type.navigationBars()) else hide(WindowInsets.Type.navigationBars())
        }
      }
    }
    windowActivity = null
    return cleanupError
  }

  private fun releaseService() {
    connection?.let { currentConnection ->
      if (bound) runCatching { context.unbindService(currentConnection) }
    }
    connection = null
    bound = false
    service = null
  }

  private fun failStart(code: String, error: Exception) {
    val promise = startPromise
    startPromise = null
    val cleanupError = stopSession()
    reason = cleanupError?.message ?: error.message ?: "Drive focus could not start"
    promise?.reject(code, reason, error)
    emitStatus()
  }

  private fun status(): WritableMap = Arguments.createMap().apply {
    putBoolean("available", true)
    putBoolean("focusSupported", Build.VERSION.SDK_INT >= 29)
    putBoolean("policyAccessGranted", manager.isNotificationPolicyAccessGranted)
    putBoolean("bluetoothPermissionGranted", bluetoothPermissionGranted())
    putBoolean("bluetoothCallConnected", bluetoothConnected)
    val routeActive = if (!bluetoothPermissionGranted()) false else runCatching {
      if (Build.VERSION.SDK_INT >= 31) audio.communicationDevice?.let(::isCallBluetooth) == true else audio.isBluetoothScoOn
    }.getOrDefault(false)
    putBoolean("bluetoothCallRouteActive", routeActive)
    putBoolean("sessionActive", sessionActive)
    putBoolean("focusActive", focusActive && sessionActive && quietRequested)
    putBoolean("focusStateConfirmed", focusStateConfirmed)
    putBoolean("quietRequested", quietRequested)
    putBoolean("cleanupPending", cleanupPending)
    putString("reason", reason)
  }

  private fun emitStatus() {
    if (!disposed && listeners > 0 && context.hasActiveReactInstance()) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("DrowsyGuardDriveModeChanged", status())
    }
  }

  override fun onHostResume() { handler.post { refreshBluetooth() } }
  override fun onHostPause() { handler.post { stopSession(); emitStatus() } }
  override fun onHostDestroy() { handler.post { stopSession(); emitStatus() } }

  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    handler.post {
      disposed = true
      stopSession()
      if (receiverRegistered) runCatching { context.unregisterReceiver(receiver) }
      audio.unregisterAudioDeviceCallback(audioCallback)
      headset?.let { proxy -> runCatching { adapter?.closeProfileProxy(BluetoothProfile.HEADSET, proxy) } }
      headset = null
    }
    super.invalidate()
  }
}
