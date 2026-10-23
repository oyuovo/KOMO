/** Incremental SSE framing; metadata must never leak into answer text. */
export class SseDecoder {
  private buffer = '';
  private type = 'message';
  private data: string[] = [];

  push(text: string): { type: string; data: string }[] {
    this.buffer += text;
    if (this.buffer.length > 200000) throw new Error('服务端事件过大');
    const result: { type: string; data: string }[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) {
        if (this.data.length) result.push({ type: this.type, data: this.data.join('\n') });
        this.type = 'message';
        this.data = [];
      } else if (line.startsWith('event:')) {
        this.type = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this.data.push(line.slice(5).replace(/^ /, ''));
        if (this.data.reduce((n, part) => n + part.length, 0) > 200000) throw new Error('服务端事件过大');
      }
    }
    return result;
  }
}
