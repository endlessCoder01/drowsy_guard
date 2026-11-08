import React, { useEffect } from 'react';
import { BackHandler, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AppHeader from './AppHeader';
import TabBar from './TabBar';
import { ScreenEntrance } from '../ui/Visuals';
import { C, styles } from '../ui/theme';

export default function AppShell({ immersive, tab, onTab, onExit, feedback, children }) {
  useEffect(() => {
    if (!immersive) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onExit(); return true; });
    return () => subscription.remove();
  }, [immersive, onExit]);
  const Root = immersive ? View : SafeAreaView;
  return (
    <Root style={[styles.appRoot, immersive && shellStyles.immersive]}>
      <StatusBar hidden={immersive} barStyle="dark-content" backgroundColor={C.bg} translucent={false} />
      <ExpoStatusBar hidden={immersive} style="dark" backgroundColor={C.bg} translucent={false} />
      {!immersive ? <AppHeader monitoring={false} onHome={() => onTab('home')} /> : null}
      <View style={styles.mainContent}>
        {!immersive ? feedback : null}
        {immersive ? children : <ScreenEntrance key={tab} style={{ flex: 1 }}>{children}</ScreenEntrance>}
        {immersive ? <View pointerEvents="box-none" style={shellStyles.feedback}>{feedback}</View> : null}
      </View>
      {!immersive ? <TabBar tab={tab} onTab={onTab} monitoring={false} /> : null}
    </Root>
  );
}

const shellStyles = StyleSheet.create({
  immersive: { backgroundColor: C.darker },
  feedback: { position: 'absolute', top: '36%', left: 0, right: 0, zIndex: 10 },
});
