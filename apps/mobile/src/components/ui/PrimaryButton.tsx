import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, disabled, variant = "primary", style }: Props) {
  return (
    <Pressable
      style={[
        styles.base,
        variant === "secondary" ? styles.secondary : styles.primary,
        disabled ? styles.disabled : null,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, variant === "secondary" ? styles.secondaryText : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.bgAccentSoft,
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    color: theme.colors.textOnPrimary,
    fontSize: 14,
    fontWeight: theme.typography.weightBlack,
  },
  secondaryText: {
    color: theme.colors.primaryBright,
  },
});
