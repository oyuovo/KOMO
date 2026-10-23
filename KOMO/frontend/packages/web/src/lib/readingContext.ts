export interface ReadingSource {
  id: string;
  heading: string;
  start_line: number;
  end_line: number;
  text: string;
}

export interface ReadingContext {
  document_id: string;
  document_hash: string;
  mode: 'full_document' | 'lexical_sections' | 'hybrid_sections';
  state: 'running' | 'completed';
  sources: ReadingSource[];
  warnings: string[];
  citations?: { status: 'present' | 'missing' | 'invalid'; cited_ids: string[]; invalid_ids: string[] };
}

/** Old messages have no snapshot; malformed snapshots must not break the conversation. */
export function parseReadingContext(raw?: string | null): ReadingContext | null {
  if (!raw || raw.length > 64000) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value?.document_id !== 'string' || !/^[a-f0-9]{64}$/.test(value.document_hash)
      || !['full_document', 'lexical_sections', 'hybrid_sections'].includes(value.mode)
      || !['running', 'completed'].includes(value.state)
      || !Array.isArray(value.sources) || value.sources.length > 24
      || !Array.isArray(value.warnings) || !value.warnings.every((x: unknown) => typeof x === 'string')) return null;
    for (const source of value.sources) {
      if (!/^S\d+$/.test(source?.id) || typeof source.heading !== 'string' || typeof source.text !== 'string'
        || !Number.isInteger(source.start_line) || source.start_line < 1
        || !Number.isInteger(source.end_line) || source.end_line < source.start_line) return null;
    }
    if (value.citations && (!['present', 'missing', 'invalid'].includes(value.citations.status)
      || !Array.isArray(value.citations.cited_ids) || !Array.isArray(value.citations.invalid_ids))) return null;
    return value as ReadingContext;
  } catch {
    return null;
  }
}
