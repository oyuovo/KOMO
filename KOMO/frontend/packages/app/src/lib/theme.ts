/** KOMO App 主题 — 与 Web 端视觉语言对齐（简洁、暖灰底、蓝主色） */
export const colors = {
  bg: '#F7F6F3',
  card: '#FFFFFF',
  border: '#E5E2DC',
  primary: '#2563EB',
  primarySoft: '#DBEAFE',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  userBubble: '#2563EB',
  aiBubble: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warn: '#D97706',
  warnSoft: '#FEF3C7',
  ok: '#059669',
  okSoft: '#D1FAE5',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
