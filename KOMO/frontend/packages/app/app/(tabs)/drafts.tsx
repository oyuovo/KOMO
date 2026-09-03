import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../src/lib/api';
import { Markdown } from '../../src/lib/markdown';
import { colors, radius, spacing } from '../../src/lib/theme';
import type { Draft } from '../../src/lib/types';

const EXTRACT_LABEL: Record<string, string> = {
  ARTICLE: '文章',
  FRAGMENT: '碎片',
  SUPPLEMENT: '补充',
};

const EXTRACT_COLOR: Record<string, { fg: string; bg: string }> = {
  ARTICLE: { fg: colors.accent, bg: colors.accentSoft },
  FRAGMENT: { fg: colors.warning, bg: colors.warningSoft },
  SUPPLEMENT: { fg: colors.success, bg: colors.successSoft },
};

export default function DraftsScreen() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Draft | null>(null);
  const [acting, setActing] = useState<string | null>(null); // 正在确认/驳回的 draft id

  const load = useCallback(async () => {
    try {
      const list = await api<Draft[]>('/drafts');
      setDrafts((list ?? []).filter((d) => d.status === 'PENDING'));
    } catch (e) {
      Alert.alert('加载失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDraft = async (draft: Draft) => {
    if (acting) return;
    setActing(draft.id);
    try {
      // 默认去向：ARTICLE/FRAGMENT → 默认 KB；SUPPLEMENT 后端自动匹配父文章
      await api(`/drafts/${draft.id}/confirm`, { method: 'POST', body: '{}' });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setDetail(null);
      Alert.alert('已入库', `「${draft.title}」已保存，可在知识库中查看。`);
    } catch (e) {
      Alert.alert('确认失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setActing(null);
    }
  };

  const rejectDraft = async (draft: Draft) => {
    if (acting) return;
    setActing(draft.id);
    try {
      await api(`/drafts/${draft.id}/reject`, { method: 'POST' });
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setDetail(null);
    } catch (e) {
      Alert.alert('驳回失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={drafts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
        contentContainerStyle={drafts.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="edit-3" size={44} color={colors.textTertiary} />
            <Text style={styles.emptyText}>草稿箱是空的</Text>
            <Text style={styles.emptyHint}>
              在对话中点「⚡ 提取」，AI 会把有价值的内容整理成草稿放在这里
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = EXTRACT_COLOR[item.extractType] ?? EXTRACT_COLOR.ARTICLE;
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => setDetail(item)}
            >
              <View style={styles.cardHead}>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>
                    {EXTRACT_LABEL[item.extractType] ?? item.extractType}
                  </Text>
                </View>
                <Text style={styles.confidence}>{Math.round(item.confidence * 100)}%</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.cardPreview} numberOfLines={2}>
                {item.content}
              </Text>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => rejectDraft(item)}
                  disabled={acting === item.id}
                >
                  <Text style={styles.btnGhostText}>驳回</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => confirmDraft(item)}
                  disabled={acting === item.id}
                >
                  {acting === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>确认入库</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          );
        }}
      />

      {/* 草稿详情弹层 */}
      <Modal visible={detail !== null} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalSheet}>
            {detail && (
              <>
                <Text style={styles.modalTitle}>{detail.title}</Text>
                <Text style={styles.modalMeta}>
                  类型 {EXTRACT_LABEL[detail.extractType] ?? detail.extractType} · 置信度{' '}
                  {Math.round(detail.confidence * 100)}%
                </Text>
                <FlatList
                  data={[detail.content]}
                  keyExtractor={(x) => x}
                  renderItem={({ item }) => <Markdown text={item} />}
                  contentContainerStyle={styles.modalBody}
                />
                {detail.sourceQuote && (
                  <View style={styles.quoteBox}>
                    <Text style={styles.quoteLabel}>来源摘录</Text>
                    <Text style={styles.quoteText} numberOfLines={4}>
                      {detail.sourceQuote}
                    </Text>
                  </View>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnGhost, styles.btnLarge]}
                    onPress={() => rejectDraft(detail)}
                    disabled={acting === detail.id}
                  >
                    <Text style={styles.btnGhostText}>驳回</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, styles.btnLarge]}
                    onPress={() => confirmDraft(detail)}
                    disabled={acting === detail.id}
                  >
                    {acting === detail.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.btnPrimaryText}>确认入库</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetail(null)}>
              <Text style={styles.modalCloseText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardPressed: { backgroundColor: colors.accentSoft },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  confidence: { fontSize: 11, color: colors.textSecondary },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardPreview: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  emptyHint: { fontSize: 12, color: colors.textTertiary, paddingHorizontal: spacing.xl, textAlign: 'center' },
  btn: { borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  btnLarge: { flex: 1, paddingVertical: 12 },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnGhost: { backgroundColor: colors.surfaceHover },
  btnGhostText: { color: colors.textSecondary, fontSize: 14 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '88%',
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md },
  modalBody: { paddingBottom: spacing.md },
  quoteBox: {
    backgroundColor: colors.surfaceHover,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  quoteLabel: { fontSize: 11, color: colors.textTertiary, marginBottom: 4 },
  quoteText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalClose: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  modalCloseText: { color: colors.textSecondary, fontSize: 15 },
});
