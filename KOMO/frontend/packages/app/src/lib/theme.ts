/**
 * KOMO App 主题 — 与 Web 端设计令牌严格一一对应
 * （源：frontend/packages/shared/tokens/tokens.css，勿凭感觉改色值）
 */
export const colors = {
  // === 基础色彩 ===
  bg: '#FAF9F6', // --komo-bg 米白
  surface: '#FFFFFF', // --komo-surface
  surfaceHover: '#F5F3EF', // --komo-surface-hover
  border: '#E7E3DC', // --komo-border 暖灰
  borderHover: '#D4CCC0', // --komo-border-hover

  text: '#2C2416', // --komo-text 深棕
  textSecondary: '#7A7265', // --komo-text-secondary
  textTertiary: '#A0988C', // --komo-text-tertiary

  accent: '#B85C38', // --komo-accent 陶土橙
  accentHover: '#A04E2E', // --komo-accent-hover
  accentSoft: '#FDF2ED', // --komo-accent-soft

  // === 语义色 ===
  success: '#5B8C5A',
  successSoft: '#EDF5EC',
  warning: '#D4A64A',
  warningSoft: '#FAF3E3',
  danger: '#C05050',
  dangerSoft: '#F9ECEC',

  // === 派生 ===
  userBubble: '#B85C38', // 用户气泡 = accent（同 Web chat）
  aiBubble: '#FFFFFF', // AI 气泡 = surface + border
};

/** KOMO 阴影（Web tokens 的 RN 等价） */
export const shadow = {
  sm: {
    shadowColor: '#2C2416',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#2C2416',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lg: {
    shadowColor: '#2C2416',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
};

export const typography = {
  title: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  secondary: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 11, color: colors.textTertiary },
};
