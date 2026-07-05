import { StyleSheet, Text, View } from "react-native";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

type Props = {
  title: string;
  badge?: string;
  subtitle?: string;
};

export function SectionHeader({ title, badge, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: theme.typography.weightBlack,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(211,230,255,0.9)",
  },
  badgeText: {
    color: theme.colors.primaryBright,
    fontSize: 10,
    fontWeight: theme.typography.weightBold,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: theme.typography.weightMedium,
    lineHeight: 16,
  },
});
