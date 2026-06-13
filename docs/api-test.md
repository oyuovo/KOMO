# API Test (Python)

```python
import urllib.request, json
BASE = 'http://localhost:8081/api'
def post(path, data, token=''):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = f'Bearer {token}'
    r = urllib.request.Request(BASE+path, data=json.dumps(data).encode(), headers=h, method='POST')
    with urllib.request.urlopen(r) as resp: return json.loads(resp.read())

# Login
auth = post('/auth/login', {'email':'admin@komo.dev','password':'123123'})
t = auth['data']['accessToken']

# Create conv → send message → check drafts
conv = post('/conversations', {'title':'test'}, t)
msg = post(f'/conversations/{conv["data"]["id"]}/messages', {'content':'hello'}, t)

# List drafts
drafts_req = urllib.request.Request(BASE+'/drafts', headers={'Authorization': f'Bearer {t}'})
with urllib.request.urlopen(drafts_req) as r: drafts = json.loads(r.read())
print(f'Drafts: {drafts["data"]}')

# Reindex ES
reindex_req = urllib.request.Request(BASE+'/knowledge/reindex', headers={'Authorization': f'Bearer {t}'}, method='POST')
with urllib.request.urlopen(reindex_req) as r: print(json.loads(r.read()))

# Check ES
es_resp = urllib.request.urlopen('http://localhost:9201/komo_knowledge/_count')
print(f'ES count: {json.loads(es_resp.read())["count"]}')
```
