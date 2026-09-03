import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/lib/api';
import { Markdown } from '../../src/lib/markdown';
import { colors, radius, spacing } from '../../src/lib/theme';
import type { KnowledgeEntry } from '../../src/lib/types';

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        setEntry(await api<KnowledgeEntry>(`/knowledge/${id}`));
      } catch (e) {
        Alert.alert('加载失败', e instanceof Error ? e.message : '未知错误');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!entry) return <View style={styles.center} />;

  const metaParts = [
    entry.entryType === 'FRAGMENT' ? '知识碎片' : '知识文章',
    entry.source ? `来源 ${entry.source}` : null,
    entry.tags || null,
    new Date(entry.updatedAt).toLocaleDateString('zh-CN'),
  ].filter(Boolean) as string[];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{entry.title}</Text>
      <Markdown text={entry.content} />
      <View style={styles.meta}>
        <Text style={styles.metaText}>{metaParts.join(' · ')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  meta: {
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaText: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' },
});
