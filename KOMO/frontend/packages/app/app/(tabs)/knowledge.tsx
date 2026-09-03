import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../src/lib/api';
import { colors, radius, spacing } from '../../src/lib/theme';
import type { KnowledgeEntry, Page } from '../../src/lib/types';

const PAGE_SIZE = 20;

export default function KnowledgeScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPage = useCallback(
    async (p: number, q: string, replace: boolean) => {
      try {
        const params = new URLSearchParams({
          page: String(p),
          size: String(PAGE_SIZE),
        });
        if (q.trim()) params.set('q', q.trim());
        const result = await api<Page<KnowledgeEntry>>(`/knowledge?${params.toString()}`);
        setEntries((prev) => (replace ? result.content : [...prev, ...result.content]));
        setPage(result.page);
        setTotalPages(result.totalPages);
      } catch (e) {
        Alert.alert('加载失败', e instanceof Error ? e.message : '未知错误');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPage(0, activeQuery, true);
  }, [fetchPage, activeQuery]);

  const onSearch = () => {
    setLoading(true);
    setActiveQuery(query);
  };

  const loadMore = () => {
    if (loadingMore || loading || page + 1 >= totalPages) return;
    setLoadingMore(true);
    fetchPage(page + 1, activeQuery, false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索知识库…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPage(0, activeQuery, true);
              }}
            />
          }
          contentContainerStyle={entries.length === 0 ? styles.emptyWrap : styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyGlyph}>📚</Text>
              <Text style={styles.emptyText}>
                {activeQuery ? '没有匹配的知识条目' : '知识库还是空的'}
              </Text>
              {!activeQuery && (
                <Text style={styles.emptyHint}>去对话里和 AI 聊聊，提取知识后会出现在这里</Text>
              )}
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.textTertiary} style={{ margin: spacing.md }} /> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/knowledge/${item.id}`)}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.cardPreview} numberOfLines={2}>
                {item.content}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardMetaText}>
                  {item.entryType === 'FRAGMENT' ? '碎片' : '文章'}
                  {item.tags ? ` · ${item.tags}` : ''}
                </Text>
                <Text style={styles.cardMetaText}>
                  {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { padding: spacing.md, paddingTop: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardPreview: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cardMetaText: { fontSize: 11, color: colors.textTertiary },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyGlyph: { fontSize: 44 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  emptyHint: { fontSize: 12, color: colors.textTertiary, paddingHorizontal: spacing.xl, textAlign: 'center' },
});
