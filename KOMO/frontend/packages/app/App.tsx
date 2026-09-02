// KOMO App Spike — Phase 0 技术验证
// 验证目标：① Bearer 认证走通 ② SSE 流式对话在 RN 上可用 ③ 提取→草稿异步链路可达
import React, { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import EventSource from 'react-native-sse';

const TEST_EMAIL = 'admin@komo.dev';
const TEST_PASSWORD = '123123';
const TEST_MESSAGE = '请介绍 Redis 持久化的两种方式 RDB 和 AOF 的核心区别';

type Phase = 'idle' | 'login' | 'conversation' | 'streaming' | 'extract' | 'polling' | 'done' | 'failed';

export default function App() {
  const [server, setServer] = useState('http://10.65.13.123:8081/api');
  const [phase, setPhase] = useState<Phase>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [streamText, setStreamText] = useState('');
  const [draftTitles, setDraftTitles] = useState<string[]>([]);
  const tokenRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const busy = phase !== 'idle' && phase !== 'done' && phase !== 'failed';

  /** 带 Bearer 认证的 JSON 请求 */
  async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(`${server}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`${options.method || 'GET'} ${path} → HTTP ${res.status} ${JSON.stringify(json)}`);
    }
    return json?.data as T;
  }

  /** SSE 流式发消息 — react-native-sse 支持 POST + 自定义头（RN fetch 不支持流式响应体） */
  function streamMessage(convoId: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 自定义事件名（token/done）通过泛型声明，与后端 writeSseEvent 的事件契约一致
      const es = new EventSource<'token' | 'done'>(`${server}/conversations/${convoId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ content }),
        timeout: 120000,
      });
      let settled = false;
      es.addEventListener('token', (e: any) => {
        setStreamText((prev) => prev + (e.data ?? ''));
      });
      es.addEventListener('done', () => {
        if (!settled) { settled = true; es.close(); resolve(); }
      });
      es.addEventListener('error', (e: any) => {
        if (!settled) {
          settled = true;
          es.close();
          // 连接层错误 e.message；业务错误事件 e.data
          reject(new Error(e?.data || e?.message || 'SSE 未知错误'));
        }
      });
    });
  }

  async function runSpike() {
    setLogs([]);
    setStreamText('');
    setDraftTitles([]);
    tokenRef.current = null;
    try {
      // ① 登录（X-Komo-Client: mobile → token 在 body 返回）
      setPhase('login');
      log('① 登录中…');
      const res = await fetch(`${server}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Komo-Client': 'mobile' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      });
      const authJson = await res.json();
      if (!res.ok || !authJson?.data?.accessToken) {
        throw new Error(`登录失败 HTTP ${res.status}：body 中无 accessToken（检查 X-Komo-Client 适配）`);
      }
      tokenRef.current = authJson.data.accessToken;
      log(`✅ Bearer token 获取成功（${tokenRef.current!.slice(0, 24)}…）`);

      // ② 建对话（验证 Bearer 过 CSRF + 认证）；无知识库对话不支持提取，需先取默认 KB
      setPhase('conversation');
      log('② 创建对话…');
      const kbs = await api<Array<{ id: string; type?: string }>>('/knowledge-bases');
      const kb = (kbs || []).find((k) => k.type === 'DEFAULT') || (kbs || [])[0];
      if (!kb) throw new Error('未找到可用知识库');
      const convo = await api<{ id: string }>('/conversations', {
        method: 'POST',
        body: { title: 'App Spike 验证', knowledgeBaseId: kb.id },
      });
      log(`✅ 对话已创建 id=${convo.id.slice(0, 8)}（Bearer 认证 + CSRF 豁免通过）`);

      // ③ SSE 流式对话
      setPhase('streaming');
      log('③ 发送消息，SSE 流式接收…');
      const t0 = Date.now();
      await streamMessage(convo.id, TEST_MESSAGE);
      log(`✅ SSE 流式完成，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s（RN 上 POST+SSE 可用）`);

      // ④ 触发异步提取
      setPhase('extract');
      log('④ 触发知识提取（RabbitMQ 异步）…');
      await api(`/conversations/${convo.id}/extract`, { method: 'POST' });
      log('✅ 提取已触发，开始轮询草稿箱…');

      // ⑤ 轮询草稿（异步链路最终产物验证）
      setPhase('polling');
      for (let i = 1; i <= 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const drafts = await api<Array<{ id: string; title: string }>>('/drafts');
        log(`轮询 #${i}：草稿 ${drafts?.length ?? 0} 条`);
        if (drafts && drafts.length > 0) {
          setDraftTitles(drafts.map((d) => d.title));
          log(`🎉 草稿生成成功：${drafts.map((d) => d.title).join('、')}`);
          setPhase('done');
          log('=== Spike 全部通过：登录/SSE/提取链路在 RN 上均可用 ===');
          return;
        }
      }
      throw new Error('120 秒内草稿箱无产出（检查后端提取日志）');
    } catch (e: any) {
      setPhase('failed');
      log(`❌ 失败：${e?.message ?? e}`);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>KOMO App Spike</Text>
        <Text style={styles.subtitle}>Phase 0：安卓真机 · Bearer + SSE + 提取链路</Text>
      </View>

      <TextInput
        style={styles.input}
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        editable={!busy}
        placeholder="后端地址 http://<电脑IP>:8081/api"
      />

      <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={runSpike} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? `运行中（${phase}）…` : '▶ 运行全闭环 Spike'}</Text>
      </TouchableOpacity>

      {streamText.length > 0 && (
        <View style={styles.streamBox}>
          <Text style={styles.streamLabel}>AI 流式回复：</Text>
          <Text style={styles.streamText} numberOfLines={8}>{streamText}</Text>
        </View>
      )}

      {draftTitles.length > 0 && (
        <View style={styles.draftBox}>
          <Text style={styles.streamLabel}>🎉 生成的草稿：</Text>
          {draftTitles.map((t, i) => <Text key={i} style={styles.draftItem}>· {t}</Text>)}
        </View>
      )}

      <View style={styles.logBox}>
        <Text style={styles.streamLabel}>日志：</Text>
        <ScrollView ref={scrollRef} style={styles.logScroll} nestedScrollEnabled>
          {logs.length === 0 && <Text style={styles.logLine}>（点击上方按钮开始）</Text>}
          {logs.map((l, i) => <Text key={i} style={styles.logLine}>{l}</Text>)}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1115', padding: 16 },
  header: { marginBottom: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#8b93a7', fontSize: 13, marginTop: 4 },
  input: {
    backgroundColor: '#1a1e28', color: '#e6e9f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#2a3040',
  },
  button: { backgroundColor: '#4f7cff', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#33406b' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  streamBox: { marginTop: 12, backgroundColor: '#141824', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#232a3d' },
  streamLabel: { color: '#8b93a7', fontSize: 12, marginBottom: 6 },
  streamText: { color: '#cdd4e4', fontSize: 13, lineHeight: 20 },
  draftBox: { marginTop: 12, backgroundColor: '#12211a', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1d3a2b' },
  draftItem: { color: '#7ee2a8', fontSize: 14, marginTop: 4 },
  logBox: { flex: 1, marginTop: 12, backgroundColor: '#10131b', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#1e2433' },
  logScroll: { flex: 1 },
  logLine: { color: '#9aa3b8', fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
});
