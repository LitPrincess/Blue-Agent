import { ReactNode, RefObject } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";
import { BlueMapBackground } from "./BlueMapBackground";
import { BottomNavBar, MainTab } from "./BottomNavBar";

type Props = {
  dark?: boolean;
  currentTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  scrollEnabled?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  contentContainerStyle?: ViewStyle;
  children: ReactNode;
};

export function BlueMapShell({
  dark,
  currentTab,
  onTabChange,
  scrollEnabled = true,
  scrollRef,
  contentContainerStyle,
  children,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, dark ? styles.rootDark : styles.rootLight]}>
      {!dark ? <BlueMapBackground /> : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View
        style={[
          styles.navWrap,
          dark ? styles.navWrapDark : styles.navWrapLight,
          { paddingBottom: Math.max(insets.bottom, 6) },
        ]}
      >
        <BottomNavBar current={currentTab} onChange={onTabChange} dark={dark} />
        <View style={[styles.homeIndicatorTrack, dark ? styles.homeIndicatorTrackDark : null]}>
          <View style={styles.homeIndicator} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  rootLight: {
    backgroundColor: theme.colors.bgSky,
  },
  rootDark: {
    backgroundColor: theme.colors.bgExecution,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    flexGrow: 1,
  },
  navWrap: {
    borderTopWidth: 1,
  },
  navWrapLight: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopColor: "rgba(27,111,255,0.1)",
  },
  navWrapDark: {
    backgroundColor: theme.colors.bgExecution,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  homeIndicatorTrack: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 2,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  homeIndicatorTrackDark: {
    backgroundColor: theme.colors.bgExecution,
  },
  homeIndicator: {
    width: 128,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
});
