@file:Suppress("DEPRECATION")

package com.drowsyguard.drive

import android.app.AutomaticZenRule
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.Parcel
import android.os.Process
import android.service.notification.Condition
import android.service.notification.ConditionProviderService
import android.service.notification.ZenPolicy
import android.util.Log

/**
 * Lives in :driveFocus, so a dying camera/React process drops its Binder lease.
 * No session is persisted. A fresh provider process always publishes false.
 */
class DriveConditionService : ConditionProviderService() {
  companion object {
    const val SESSION_ACTION = "com.drowsyguard.drive.SESSION"
    const val DESCRIPTOR = "com.drowsyguard.drive.Session"
    const val CONFIGURE = IBinder.FIRST_CALL_TRANSACTION
    const val STOP = IBinder.FIRST_CALL_TRANSACTION + 1
    const val STATUS = IBinder.FIRST_CALL_TRANSACTION + 2

    fun owner(context: Context) = ComponentName(context, DriveConditionService::class.java)
    fun conditionId(context: Context): Uri = Uri.parse("condition://${context.packageName}/drowsyguard/monitoring")

    fun ownedRuleIds(context: Context): List<String> {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (!manager.isNotificationPolicyAccessGranted) return emptyList()
      return manager.automaticZenRules.filterValues {
        it.owner == owner(context) && it.conditionId == conditionId(context)
      }.keys.toList()
    }

    fun removeOwnedRules(context: Context) {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (!manager.isNotificationPolicyAccessGranted) return
      var failure: Throwable? = null
      for (id in ownedRuleIds(context)) {
        // Never modify the global interruption filter or another rule.
        if (Build.VERSION.SDK_INT >= 29) {
          runCatching {
            manager.setAutomaticZenRuleState(id, Condition(conditionId(context), "Monitoring stopped", Condition.STATE_FALSE))
          }.onFailure { failure = it }
        }
        // Removal still runs if publishing false failed or the provider detached.
        runCatching {
          check(manager.removeAutomaticZenRule(id)) { "Android did not remove drive focus" }
        }.onFailure { failure = it }
      }
      check(ownedRuleIds(context).isEmpty()) { "An owned drive focus rule remains: ${failure?.message ?: "removal failed"}" }
    }
  }

  private var lease: IBinder? = null
  private var ruleId: String? = null
  private var callsAllowed = false
  private val manager get() = getSystemService(NotificationManager::class.java)
  private val leaseDeath = IBinder.DeathRecipient {
    synchronized(this@DriveConditionService) { deactivate() }
  }

  private val sessionBinder = object : Binder() {
    override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
      if (code == INTERFACE_TRANSACTION) {
        reply?.writeString(DESCRIPTOR)
        return true
      }
      if (Binder.getCallingUid() != Process.myUid()) throw SecurityException("Private drive session")
      data.enforceInterface(DESCRIPTOR)
      synchronized(this@DriveConditionService) {
        when (code) {
          CONFIGURE -> {
            val token = data.readStrongBinder() ?: throw IllegalArgumentException("Missing session lease")
            configure(token, data.readInt() != 0)
          }
          STOP -> deactivate()
          STATUS -> Unit
          else -> return super.onTransact(code, data, reply, flags)
        }
        reply?.writeNoException()
        reply?.writeInt(if (isRuleActive()) 1 else 0)
        reply?.writeInt(if (Build.VERSION.SDK_INT >= 35) 1 else 0)
      }
      return true
    }
  }

  override fun onBind(intent: Intent): IBinder? =
    if (intent.action == SESSION_ACTION) sessionBinder else super.onBind(intent)

  @Synchronized
  override fun onConnected() {
    if (lease?.isBinderAlive == true && ruleId != null) publish(true) else deactivate()
  }

  @Synchronized
  override fun onSubscribe(conditionId: Uri) {
    if (conditionId == Companion.conditionId(this)) publish(lease?.isBinderAlive == true && ruleId != null)
  }

  override fun onUnsubscribe(conditionId: Uri) = Unit

  @Synchronized
  override fun onUnbind(intent: Intent): Boolean {
    if (intent.action == SESSION_ACTION) deactivate()
    return super.onUnbind(intent)
  }

  @Synchronized
  override fun onDestroy() {
    deactivate()
    super.onDestroy()
  }

  private fun configure(token: IBinder, allowCalls: Boolean) {
    check(Build.VERSION.SDK_INT >= 29) { "Drive focus requires Android 10 or later" }
    check(manager.isNotificationPolicyAccessGranted) { "Do Not Disturb access has not been granted" }
    if (lease !== token) {
      deactivate()
      token.linkToDeath(leaseDeath, 0)
      lease = token
    }
    val existingId = ruleId
    if (existingId != null && callsAllowed == allowCalls) {
      // Respect a user's manual deactivation; do not reactivate on every status poll.
      return
    }
    callsAllowed = allowCalls
    val policy = ZenPolicy.Builder()
      .disallowAllSounds()
      .allowMedia(true)
      .allowCalls(if (allowCalls) ZenPolicy.PEOPLE_TYPE_ANYONE else ZenPolicy.PEOPLE_TYPE_NONE)
      .allowRepeatCallers(false)
      .hideAllVisualEffects()
      .apply {
        if (Build.VERSION.SDK_INT >= 30) allowConversations(ZenPolicy.CONVERSATION_SENDERS_NONE)
        if (Build.VERSION.SDK_INT >= 35) allowPriorityChannels(false)
      }
      .build()
    val rule = AutomaticZenRule(
      "DrowsyGuard drive focus", owner(this), null, conditionId(this), policy,
      NotificationManager.INTERRUPTION_FILTER_PRIORITY,
      existingId?.let { manager.getAutomaticZenRule(it)?.isEnabled } ?: true,
    )
    try {
      if (existingId == null) {
        removeOwnedRules(this)
        ruleId = manager.addAutomaticZenRule(rule) ?: error("Android did not create drive focus")
      } else {
        check(manager.updateAutomaticZenRule(existingId, rule)) { "Android did not update drive focus" }
      }
      publish(true)
    } catch (error: Exception) {
      deactivate()
      throw error
    }
  }

  private fun publish(active: Boolean) {
    if (Build.VERSION.SDK_INT < 29 || !manager.isNotificationPolicyAccessGranted) return
    val condition = Condition(conditionId(this), "DrowsyGuard monitoring", if (active) Condition.STATE_TRUE else Condition.STATE_FALSE)
    ruleId?.let { manager.setAutomaticZenRuleState(it, condition) }
  }

  private fun isRuleActive(): Boolean {
    val id = ruleId ?: return false
    if (lease?.isBinderAlive != true || !manager.isNotificationPolicyAccessGranted) return false
    val rule = manager.getAutomaticZenRule(id) ?: return false
    if (!rule.isEnabled) return false
    return if (Build.VERSION.SDK_INT >= 35) {
      manager.getAutomaticZenRuleState(id) == Condition.STATE_TRUE
    } else {
      // Prior to API35 no per-rule activation query exists. Expose this uncertainty.
      manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL &&
        manager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    }
  }

  private fun deactivate() {
    lease?.let { runCatching { it.unlinkToDeath(leaseDeath, 0) } }
    lease = null
    runCatching { publish(false) }
      .onFailure { Log.w("DrowsyGuardDriveMode", "Could not publish an inactive drive focus condition", it) }
    runCatching { removeOwnedRules(this) }
      .onFailure { Log.w("DrowsyGuardDriveMode", "Could not remove the owned drive focus rule", it) }
    ruleId = null
    callsAllowed = false
  }
}
