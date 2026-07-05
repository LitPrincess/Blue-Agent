import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  padded?: boolean;
};

export function GlassCard({ children, style, strong, padded = true }: Props) {
  return (
    <View
      style={[
        styles.card,
        strong ? styles.strong : null,
        padded ? styles.padded : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgGlass,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    ...theme.shadow.soft,
  },
  strong: {
    backgroundColor: theme.colors.bgGlassStrong,
  },
  padded: {
    padding: theme.spacing.md,
  },
});
