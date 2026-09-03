/**
 * 轻量 Markdown 渲染器 — 覆盖 KOMO 内容的主要语法：
 * 标题(#/##/###)、无序/有序列表、代码块(```)、行内代码(`)、加粗(**)、段落。
 * 不引第三方 markdown 库（依赖树与 Expo 57 冲突），渲染需求增长后再评估。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

interface Props {
  text: string;
  baseColor?: string;
}

/** 行内解析：`code` 与 **bold**（按出现顺序切分） */
function renderInline(text: string, baseColor: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<Text key={`${keyPrefix}-t${i++}`}>{text.slice(last, match.index)}</Text>);
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <Text key={`${keyPrefix}-c${i++}`} style={mdStyles.inlineCode}>
          {token.slice(1, -1)}
        </Text>
      );
    } else {
      parts.push(
        <Text key={`${keyPrefix}-b${i++}`} style={mdStyles.bold}>
          {token.slice(2, -2)}
        </Text>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(<Text key={`${keyPrefix}-t${i++}`}>{text.slice(last)}</Text>);
  return parts;
}

export function Markdown({ text, baseColor }: Props) {
  const color = baseColor ?? colors.text;
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合 ```
      blocks.push(
        <View key={`k${key++}`} style={mdStyles.codeBlock}>
          <Text style={mdStyles.codeText}>{codeLines.join('\n')}</Text>
        </View>
      );
      continue;
    }

    // 标题
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <Text
          key={`k${key++}`}
          style={level === 1 ? mdStyles.h1 : level === 2 ? mdStyles.h2 : mdStyles.h3}
        >
          {heading[2]}
        </Text>
      );
      i++;
      continue;
    }

    // 无序列表
    if (/^(\s*)[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*)[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*)[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <View key={`k${key++}`} style={mdStyles.list}>
          {items.map((item, idx) => (
            <View key={idx} style={mdStyles.listRow}>
              <Text style={[mdStyles.listBullet, { color }]}>•</Text>
              <Text style={[mdStyles.text, { color }]}>{renderInline(item, color, `li${key}-${idx}`)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <View key={`k${key++}`} style={mdStyles.list}>
          {items.map((item, idx) => (
            <View key={idx} style={mdStyles.listRow}>
              <Text style={[mdStyles.listBullet, { color }]}>{idx + 1}.</Text>
              <Text style={[mdStyles.text, { color }]}>{renderInline(item, color, `ol${key}-${idx}`)}</Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 段落（合并连续普通行）
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^(\s*)[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('```')
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={`k${key++}`} style={[mdStyles.text, { color }]}>
        {renderInline(para.join('\n'), color, `p${key}`)}
      </Text>
    );
  }

  return <View>{blocks}</View>;
}

const mdStyles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 24 },
  h1: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 6, marginBottom: 3 },
  bold: { fontWeight: '700' },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#A04E2E',
    backgroundColor: '#F5F3EF',
  },
  codeBlock: {
    backgroundColor: '#F5F3EF',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E7E3DC',
  },
  codeText: { fontFamily: 'monospace', fontSize: 13, color: '#2C2416' },
  list: { marginVertical: 4 },
  listRow: { flexDirection: 'row', marginBottom: 4 },
  listBullet: { width: 20, fontSize: 15, lineHeight: 24 },
});
