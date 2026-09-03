import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { getServerUrl, setServerUrl } from '../../src/lib/config';
import { colors, radius, spacing } from '../../src/lib/theme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [serverUrl, setServerUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    getServerUrl().then(setServerUrlInput);
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setConnected(null);
    try {
      await setServerUrl(serverUrl);
      // 用健康检查验证新地址连通性（验证响应体结构，P15 教训）
      const res = await fetch(`${(await getServerUrl()).replace(/\/api$/, '')}/api/health`);
      const text = await res.text();
      const ok = res.ok && text.includes('"status"');
      setConnected(ok);
      if (!ok) Alert.alert('提示', '地址已保存，但健康检查未通过，请确认后端已启动且 IP 正确。');
    } catch (e) {
      setConnected(false);
      Alert.alert('保存失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>账号</Text>
        <View style={styles.card}>
          <Text style={styles.nickname}>{user?.nickname || user?.email || '未登录'}</Text>
          {user?.nickname && user?.email ? (
            <Text style={styles.email}>{user.email}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>服务器</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>
            后端地址（热点切换后修改电脑 IP）
            {connected === true ? '  ✅ 可连通' : connected === false ? '  ❌ 不可达' : ''}
          </Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://<电脑IP>:8081/api"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>保存并测试</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>

      <Text style={styles.version}>KOMO Mobile · Phase 1 MVP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  nickname: { fontSize: 16, fontWeight: '600', color: colors.text },
  email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  logoutBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', color: colors.textTertiary, fontSize: 11, marginTop: spacing.xl },
});
