import React from 'react';
import { FlatList, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, styles } from '../ui/theme';
import { Pill, SectionTitle, EventRow } from '../components';

export default function HistoryScreen({ events, historyLoaded, historyLoading, pendingCount }) {
  return (
    <FlatList
      data={events}
      keyExtractor={(event, index) => event.id || `${event.timestamp}-${index}`}
      contentContainerStyle={[styles.screenContent, { gap: 0 }]}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={<View style={styles.historyHeader}>
        <View style={styles.screenHeaderRow}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.screenEyebrow}>YOUR JOURNEY, REMEMBERED</Text><Text style={styles.screenTitle}>Alert journal</Text></View><Pill label={pendingCount ? 'PENDING' : historyLoaded ? `${events.length} RECORDS` : historyLoading ? 'LOADING' : 'UNAVAILABLE'} kind="soft" /></View>
        <Text style={styles.screenIntro}>Every recorded alert has a place here. Your history stays on this device, with no automatic deletion.</Text>
        <View style={styles.historySummary}><Ionicons name="shield-checkmark-outline" size={31} color={C.mint} /><View style={{ flex: 1 }}><Text style={styles.historySummaryTitle}>Your history stays with you</Text><Text style={styles.historySummaryCopy}>Saved after each alert and restored when you reopen the app. No record limit. No clear button.</Text></View></View>
        <SectionTitle title="Recorded moments" />
      </View>}
      renderItem={({ item }) => <View style={styles.historyItem}><EventRow event={item} /></View>}
      ItemSeparatorComponent={() => <View style={styles.historyGap} />}
      ListEmptyComponent={<View style={styles.emptyCard}><View style={styles.emptyIcon}><Ionicons name="journal-outline" size={32} color={C.teal} /></View><Text style={styles.emptyTitle}>{historyLoading ? 'Opening your journal' : historyLoaded ? 'Your story starts here' : 'History is unavailable'}</Text><Text style={styles.emptyCopy}>{historyLoading ? 'Bringing back your recorded moments.' : historyLoaded ? 'When monitoring detects prolonged eye closure, the alert will be saved here.' : 'Tap Retry above to load your saved records. Existing history is kept untouched.'}</Text></View>}
      ListFooterComponent={<View style={styles.historyFooter}><Ionicons name="lock-closed-outline" size={13} color={C.muted} /><Text style={styles.helperText}>Only alert details are stored. No photos or video.</Text></View>}
    />
  );
}
