# API Test (Python)

```python
import urllib.request, json
BASE = 'http://localhost:8081/api'
def req(path, data=None, token='', method='GET'):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = f'Bearer {token}'
    r = urllib.request.Request(BASE+path,
        data=json.dumps(data).encode() if data else None, headers=h, method=method)
    with urllib.request.urlopen(r) as resp: return json.loads(resp.read())

# Login
auth = req('/auth/login', {'email':'admin@komo.dev','password':'123123'}, method='POST')
t = auth['data']['accessToken']

# Knowledge Bases
req('/knowledge-bases', token=t)                         # List (auto-creates on first call)
req('/knowledge-bases', {'name':'新库'}, t, 'POST')     # Create
req('/knowledge-bases/<id>', token=t, method='DELETE')   # Delete (system KBs return 400)

# Knowledge (filtered by KB)
req('/knowledge?kb=<kb_id>&q=search', token=t)           # List in KB
req('/knowledge/<id>', token=t)                          # Get one
req('/knowledge/<id>', {'title':'X','content':'Y'}, t, 'PUT')  # Update

# Batch delete knowledge
req('/knowledge/batch', {'ids':['<id1>','<id2>']}, t, 'DELETE')

# Merge fragment into target article
req('/knowledge/<fragment_id>/merge/<target_id>', token=t, method='POST')

# Conversations (batch delete)
req('/conversations/batch', {'ids':['<id1>']}, t, 'DELETE')

# Drafts (confirm with optional KB override)
req('/drafts/<id>/confirm', {'knowledgeBaseId':'<kb_id>'}, t, 'POST')
req('/drafts/<id>/confirm', {'parentEntryId':'<entry_id>'}, t, 'POST')

# Reindex ES
req('/knowledge/reindex', token=t, method='POST')

# Check ES
es_resp = urllib.request.urlopen('http://localhost:9201/komo_knowledge/_count')
print(f'ES count: {json.loads(es_resp.read())["count"]}')
```
