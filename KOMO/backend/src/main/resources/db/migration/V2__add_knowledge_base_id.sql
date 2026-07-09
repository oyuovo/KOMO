-- Add knowledge_base_id column to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS knowledge_base_id UUID;

-- Migrate existing conversations to user's DEFAULT KB
UPDATE conversations c SET knowledge_base_id = kb.id
FROM knowledge_bases kb
WHERE c.knowledge_base_id IS NULL
  AND kb.user_id = c.user_id
  AND kb.type = 'DEFAULT';
