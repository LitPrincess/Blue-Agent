import { StyleSheet, View } from "react-native";

import { BluemapTheme as theme } from "../../theme/bluemapTheme";

/** Decorative layers matching Figma Make intent page background. */
export function BlueMapBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />
      <View style={styles.topWash} />
      <View style={styles.orbRight} />
      <View style={styles.orbLeft} />
      <View style={styles.curveBlue} />
      <View style={styles.curveCyan} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.bgSky,
  },
  topWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    backgroundColor: theme.colors.bgGradientTop,
    opacity: 0.55,
  },
  orbRight: {
    position: "absolute",
    top: -20,
    right: -70,
    width: 220,
    height: 140,
    borderRadius: 110,
    backgroundColor: theme.colors.orbBlue,
    opacity: 0.45,
  },
  orbLeft: {
    position: "absolute",
    top: 140,
    left: -40,
    width: 180,
    height: 110,
    borderRadius: 90,
    backgroundColor: theme.colors.orbCyan,
    opacity: 0.35,
  },
  curveBlue: {
    position: "absolute",
    top: 110,
    left: -20,
    width: 420,
    height: 2,
    backgroundColor: "rgba(74,143,255,0.18)",
    transform: [{ rotate: "-8deg" }],
  },
  curveCyan: {
    position: "absolute",
    top: 190,
    left: -10,
    width: 420,
    height: 2,
    backgroundColor: "rgba(0,201,177,0.14)",
    transform: [{ rotate: "6deg" }],
  },
});
