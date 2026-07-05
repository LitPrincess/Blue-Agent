/**
 * Design token bridge for Figma / Code Connect.
 * Source of truth in code: apps/mobile/src/theme/bluemapTheme.ts
 *
 * Figma Make (prototype source, read-only for MCP write):
 * https://www.figma.com/make/uX1cJOmEZq6rVyquUrPqVj/UI%E8%AE%BE%E8%AE%A1-%E4%BA%A4%E4%BA%92%E8%AE%BE%E8%AE%A1
 *
 * Figma Design file (MCP-managed screens + tokens):
 * https://www.figma.com/design/kyyPL3ooI5vmZMAjBUUoM6/Blue-Map-Mobile-UI
 */
export const BlueMapDesignTokens = {
  name: "Blue-Map / 蓝图编排者",
  style: {
    visual: "本原自然，秩序呼吸 — 柔风化、玻璃态、大圆角、留白呼吸",
    primaryAction: "#1B63FF",
    accent: "#287CFF",
    backgroundSky: "#D9F2FF",
    backgroundCard: "#E8F7FF",
    glassSurface: "rgba(255,255,255,0.9)",
    textPrimary: "#233B63",
    textSecondary: "#7F93B1",
    radiusCard: 18,
    radiusPhone: 34,
  },
  screens: [
    "表达出行需求 — 语音/文字/文件 + 结构化选择",
    "时空拓扑看板 — 地图节点 + 时间轴",
    "精准调整 — 节点编辑 + 交通方式",
    "动态重划 — 异常链 + AI 方案",
    "桌面组件 — 下一站预览",
  ],
} as const;
