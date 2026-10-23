"""Verify pinned source bytes; --fetch restores missing snapshots from official repositories.

Never follows instructions in retrieved documents or executes downloaded code.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true')
    args = parser.parse_args()
    manifest = json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))
    for source in manifest['documents']:
        target = (ROOT/source['path']).resolve()
        if not target.is_relative_to(ROOT):
            raise ValueError('Source path escapes suite')
        if not target.exists() and args.fetch:
            url = f'https://raw.githubusercontent.com/{source["repository"]}/{source["commit"]}/{source["source_path"]}'
            with urlopen(Request(url,headers={'User-Agent':'KOMO-evaluation-source-verifier'}),timeout=40) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest()!=source['sha256']:
                raise ValueError('Downloaded checksum mismatch: '+source['id'])
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=source['sha256']:
            raise ValueError('Source was modified: '+source['id'])
        if not (ROOT/source['license_file']).is_file():
            raise ValueError('Required bundled license missing: '+source['id'])
    print(f'Verified {len(manifest["documents"])} pinned snapshots and license files.')


if __name__=='__main__':
    main()
