import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, streamMessage } from '../../src/lib/api';
import { colors, radius, spacing } from '../../src/lib/theme';
import { Markdown } from '../../src/lib/markdown';
import type { Message } from '../../src/lib/types';

interface ChatItem {
  key: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  streaming?: boolean;
  failed?: boolean;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const listRef = useRef<FlatList<ChatItem>>(null);

  const loadHistory = useCallback(async () => {
    if (!id) return;
    try {
      const messages = await api<Message[]>(`/conversations/${id}/messages`);
      setItems(
        (messages ?? []).map((m) => ({ key: m.id, role: m.role, content: m.content }))
      );
    } catch (e) {
      Alert.alert('加载失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 标题栏右侧：知识提取按钮
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={[styles.extractBtn, extracting && styles.extractBtnBusy]}
          onPress={triggerExtract}
          disabled={extracting || sending}
        >
          <Text style={styles.extractBtnText}>{extracting ? '…' : '⚡ 提取'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, extracting, sending, items.length]);

  const triggerExtract = async () => {
    if (!id) return;
    setExtracting(true);
    try {
      await api(`/conversations/${id}/extract`, { method: 'POST' });
      Alert.alert(
        '提取已触发',
        'AI 正在分析本对话，草稿生成后可在「草稿箱」Tab 查看（通常需要几十秒）。'
      );
    } catch (e) {
      Alert.alert('提取失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setExtracting(false);
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending || !id) return;
    setInput('');
    setSending(true);

    const userItem: ChatItem = { key: `u-${Date.now()}`, role: 'USER', content };
    const streamKey = `a-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      userItem,
      { key: streamKey, role: 'ASSISTANT', content: '', streaming: true },
    ]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);

    try {
      await streamMessage(id, content, {
        onToken: (text) => {
          setItems((prev) =>
            prev.map((it) =>
              it.key === streamKey ? { ...it, content: it.content + text } : it
            )
          );
        },
        onDone: () => {
          setItems((prev) =>
            prev.map((it) => (it.key === streamKey ? { ...it, streaming: false } : it))
          );
        },
        onError: (message) => {
          setItems((prev) =>
            prev.map((it) =>
              it.key === streamKey
                ? {
                    ...it,
                    streaming: false,
                    failed: true,
                    content: it.content || `⚠️ ${message}`,
                  }
                : it
            )
          );
        },
      });
    } finally {
      setSending(false);
      setItems((prev) =>
        prev.map((it) => (it.key === streamKey ? { ...it, streaming: false } : it))
      );
    }
  };

  const renderItem = ({ item }: { item: ChatItem }) => {
    const isUser = item.role === 'USER';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAi]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi, item.failed && styles.bubbleFailed]}>
          {isUser ? (
            <Text style={styles.bubbleUserText}>{item.content}</Text>
          ) : item.content ? (
            <Markdown text={item.content} />
          ) : (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          )}
          {item.streaming && item.content ? (
            <Text style={styles.cursor}>▍</Text>
          ) : null}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyGlyph}>🤖</Text>
            <Text style={styles.emptyText}>向 AI 提问，聊完后点右上「⚡ 提取」沉淀知识</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={sending ? 'AI 回复中…' : '输入消息…'}
          placeholderTextColor={colors.textTertiary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={20000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: spacing.md, paddingBottom: spacing.sm },
  empty: { alignItems: 'center', paddingTop: 120, gap: spacing.sm },
  emptyGlyph: { fontSize: 44 },
  emptyText: { fontSize: 13, color: colors.textSecondary, paddingHorizontal: spacing.xl, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.md },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAi: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bubbleUser: { backgroundColor: colors.userBubble, borderBottomRightRadius: radius.sm },
  bubbleAi: { backgroundColor: colors.aiBubble, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.sm },
  bubbleFailed: { borderColor: colors.danger },
  bubbleUserText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  cursor: { color: colors.primary, fontSize: 15 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFAF9',
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
  extractBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  extractBtnBusy: { opacity: 0.6 },
  extractBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
