import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';
import { Pill, PrimaryButton, SectionTitle, StatCard, EventRow, InfoRow } from '../components';
import { RadarVisual } from '../ui/Visuals';

export default function DashboardScreen({ events, historyLoaded, onStart, onTab, starting = false }) {
  const lastEvent = events[0];
  const today = new Date().toDateString();
  const todayCount = events.filter((event) => new Date(event.timestamp).toDateString() === today).length;
  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View><Text style={styles.greeting}>A little focus. A safer journey.</Text><Text style={styles.greetingTitle}>Hello, road ahead.</Text></View>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}><Text style={styles.heroEyebrow}>YOUR DAILY CO-PILOT</Text><Pill label="ON DEVICE" kind="dark" /></View>
        <Text style={styles.heroTitle}>Stay present.{'\n'}<Text style={styles.heroAccent}>Go further.</Text></Text>
        <Text style={styles.heroCopy}>A watchful eye for the road ahead. Get a gentle heads-up when your eyes stay closed too long.</Text>
        <RadarVisual />
        <PrimaryButton title={starting ? 'Opening camera...' : "Let's start monitoring"} disabled={starting} icon="scan-outline" onPress={onStart} />
        <Text style={styles.heroFootnote}>Mount your phone. Keep your face in view.</Text>
      </View>
      <View style={styles.statGrid}>
        <StatCard label="Your alert journal" value={historyLoaded ? String(events.length) : '\u2014'} subtitle="All recorded alerts" icon="albums-outline" color={C.blue} background={C.blueSoft} />
        <StatCard label="Recorded today" value={historyLoaded ? String(todayCount) : '\u2014'} subtitle="A snapshot of your day" icon="sunny-outline" color={C.coral} background={C.coralSoft} />
      </View>
      <View>
        <SectionTitle title="Your latest alert" action="View journal" onAction={() => onTab('history')} />
        {lastEvent ? <View style={styles.card}><EventRow event={lastEvent} /></View> : (
          <View style={styles.card}><View style={styles.infoRow}><View style={[styles.numberChip, { backgroundColor: C.tealSoft }]}><Ionicons name="leaf-outline" size={21} color={C.teal} /></View><View style={styles.infoBody}><Text style={styles.infoTitle}>{historyLoaded ? 'A fresh page awaits' : 'Opening your journal'}</Text><Text style={styles.infoText}>{historyLoaded ? 'Your alerts will appear here and stay in your journal.' : 'Your saved alerts will appear once history has loaded.'}</Text></View></View></View>
        )}
      </View>
      <SectionTitle title="Three steps to stay aware" />
      <View style={styles.card}>
        <InfoRow icon="scan-outline" title="Find your focus" text="The front camera locates your face and checks visible eye activity." />
        <View style={styles.rowDivider} />
        <InfoRow icon="timer-outline" title="Give blinks a moment" text="Brief blinks pass. Longer eye closures start your alert timer." />
        <View style={styles.rowDivider} />
        <InfoRow icon="notifications-outline" title="A nudge when it matters" text="Hear or feel a warning. Each alert is added to your local journal." />
      </View>
      <View style={styles.noticeCard}><Ionicons name="information-circle-outline" size={21} color={C.amber} /><View style={{ flex: 1 }}><Text style={styles.noticeTitle}>A helpful research companion</Text><Text style={styles.noticeText}>This prototype is not a certified safety device. Test while parked and take a break whenever you feel tired.</Text></View></View>
    </ScrollView>
  );
}
