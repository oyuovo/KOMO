import { useFocusEffect, useRouter } from 'expo-router';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../src/lib/api';
import { colors, radius, spacing } from '../../src/lib/theme';
import type { Conversation, KnowledgeBase } from '../../src/lib/types';

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}

export default function ConversationsScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api<Conversation[]>('/conversations');
      setConversations(list ?? []);
    } catch (e) {
      Alert.alert('加载失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 首次挂载加载；从聊天页返回时重载（标题/时间可能变化）
  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const createConversation = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // 无知识库对话不支持提取（P17），新建即绑定默认知识库
      const kbs = await api<KnowledgeBase[]>('/knowledge-bases');
      const kb = (kbs || []).find((k) => k.type === 'DEFAULT') || (kbs || [])[0];
      if (!kb) throw new Error('未找到可用知识库');
      const convo = await api<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim() || '新对话', knowledgeBaseId: kb.id }),
      });
      setModalVisible(false);
      setNewTitle('');
      router.push(`/chat/${convo.id}`);
    } catch (e) {
      Alert.alert('创建失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (item: Conversation) => {
    Alert.alert('删除对话', `确定删除「${item.title || '未命名对话'}」吗？关联草稿将一并删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/conversations/${item.id}`, { method: 'DELETE' });
            setConversations((prev) => prev.filter((c) => c.id !== item.id));
          } catch (e) {
            Alert.alert('删除失败', e instanceof Error ? e.message : '未知错误');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
        contentContainerStyle={conversations.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyGlyph}>💬</Text>
            <Text style={styles.emptyText}>还没有对话</Text>
            <Text style={styles.emptyHint}>点右下角 + 开始和 AI 聊天，聊完可一键提取知识</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => router.push(`/chat/${item.id}`)}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title || '未命名对话'}
              </Text>
              <Text style={styles.itemMeta}>
                {item.knowledgeBaseId ? '已绑定知识库' : '自由对话'} · {fmtTime(item.updatedAt)}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalMask} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>新对话</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="话题（如：Redis 持久化）"
              placeholderTextColor={colors.textTertiary}
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={200}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnGhost} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, creating && styles.btnDisabled]}
                onPress={createConversation}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>创建并进入</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: spacing.md, paddingBottom: 88 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemPressed: { backgroundColor: '#F0F4FF' },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.textTertiary, marginLeft: spacing.sm },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyGlyph: { fontSize: 44 },
  emptyText: { fontSize: 15, color: colors.textSecondary },
  emptyHint: { fontSize: 12, color: colors.textTertiary, paddingHorizontal: spacing.xl, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFAF9',
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  modalBtnGhostText: { color: colors.textSecondary, fontSize: 15 },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});
