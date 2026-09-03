/** 后端 API 契约类型（与 Java DTO/实体一一对应，仅含 App 用到的字段） */

export interface User {
  id: string;
  email: string;
  nickname: string;
  autoExtract: boolean;
  dailyRecommendationEnabled: boolean;
  onboardingCompleted: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  type: string; // DEFAULT | SYSTEM_FRAGMENTS
}

export interface Conversation {
  id: string;
  title: string | null;
  knowledgeBaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export type ExtractType = 'ARTICLE' | 'FRAGMENT' | 'SUPPLEMENT';
export type RelationType = 'NEW' | 'SUPPLEMENTS' | 'CONTRADICTS' | 'DUPLICATE';

export interface Draft {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  sourceQuote: string | null;
  confidence: number;
  extractType: ExtractType;
  relationType: RelationType | null;
  status: 'PENDING' | 'CONFIRMED' | 'EDITED' | 'REJECTED';
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string | null;
  entryType: string | null;
  status: string | null;
  knowledgeBaseId: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
