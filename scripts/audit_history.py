"""Scan every reachable Git blob without printing suspected credential values.
This is a focused pattern/file audit, not a guarantee against all secret formats.
Review synthetic fixtures and screenshots separately before publishing.
"""
import json
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


patterns = {
    'google_api_key': r'AIza[0-9A-Za-z_-]{35}',
    'github_token': r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'private_key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'aws_key': r'AKIA[0-9A-Z]{16}',
    'credential_url': r'https?://[^\s/:]+:[^\s/@]+@',
    'secret_assignment': r'(?im)^\s*(?:GEMINI_API_KEY|SESSION_SECRET|AUTH_PASSWORD_HASH|VAPID_PRIVATE_KEY)\s*=\s*[^#\s][^\r\n]+',
}
findings = []
blobs = 0
for row in git('rev-list', '--objects', '--all').decode().splitlines():
    oid, _, path = row.partition(' ')
    if git('cat-file', '-t', oid).strip() != b'blob':
        continue
    blobs += 1
    data = git('cat-file', 'blob', oid).decode('utf-8', errors='replace')
    for name, pattern in patterns.items():
        if re.search(pattern, data):
            findings.append({'path': path, 'rule': name, 'blob': oid[:12]})
    if (path.startswith(('.dev.vars', '.env.local', '.wrangler/', 'dist/', 'node_modules/'))
            or path.endswith(('.sqlite', '.db', '.pem', '.key'))):
        findings.append({'path': path, 'rule': 'sensitive_file'})
print(json.dumps({'history_blobs_scanned': blobs, 'findings': findings}))
sys.exit(bool(findings))
