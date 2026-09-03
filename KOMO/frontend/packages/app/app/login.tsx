import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../src/lib/auth';
import { DEFAULT_SERVER_URL, getServerUrl, setServerUrl } from '../src/lib/config';
import { colors, radius, spacing } from '../src/lib/theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [serverUrl, setServerUrlInput] = useState(DEFAULT_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    getServerUrl().then(setServerUrlInput);
  }, []);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setBusy(true);
    try {
      await setServerUrl(serverUrl); // 顺手保存服务器地址（热点 IP 变化场景）
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, nickname.trim());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.logo}>KOMO</Text>
          <Text style={styles.slogan}>AI 驱动的个人知识管理</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'login' ? '登录' : '注册'}</Text>

          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="昵称（可选）"
              placeholderTextColor={colors.textTertiary}
              value={nickname}
              onChangeText={setNickname}
              maxLength={100}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="邮箱"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextInput
            style={styles.input}
            placeholder={mode === 'register' ? '密码（至少8位，含字母和数字）' : '密码'}
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />

          <Pressable onPress={() => setShowServer((v) => !v)} style={styles.serverToggle}>
            <Text style={styles.serverToggleText}>
              服务器：{serverUrl.replace(/^https?:\/\//, '')} {showServer ? '▲' : '▼'}
            </Text>
          </Pressable>
          {showServer && (
            <TextInput
              style={[styles.input, styles.serverInput]}
              placeholder="http://<电脑IP>:8081/api"
              placeholderTextColor={colors.textTertiary}
              value={serverUrl}
              onChangeText={setServerUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {mode === 'login' ? '登录' : '注册并登录'}
              </Text>
            )}
          </TouchableOpacity>

          <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            <Text style={styles.switchText}>
              {mode === 'login' ? '没有账号？注册一个' : '已有账号？直接登录'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Beta · 局域网模式</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 40, fontWeight: '800', color: colors.primary, letterSpacing: 2 },
  slogan: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#FAFAF9',
    marginBottom: spacing.md,
  },
  serverToggle: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  serverToggleText: { fontSize: 12, color: colors.textSecondary },
  serverInput: { marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  switchText: { color: colors.primary, fontSize: 13, textAlign: 'center' },
  footer: { textAlign: 'center', color: colors.textTertiary, fontSize: 11, marginTop: spacing.xl },
});
