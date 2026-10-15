#!/usr/bin/env python3
"""Read-only preflight. Keep token values in memory and out of diagnostics."""

import hmac
import json
import re
import subprocess
import sys


ARN = 'arn:aws:secretsmanager:us-east-1:569036502058:secret:observability/dev-ingest-7UhJbL'


def read_json(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    if result.returncode:
        # CLI errors may contain response bodies. Never forward them.
        raise RuntimeError('Secret read failed; check CLI authentication and permissions')
    return json.loads(result.stdout)


def main():
    source = read_json([
        'doppler', 'secrets', 'get', 'OTLP_TOKEN', '--project', 'observability',
        '--config', 'prd', '--json', '--no-check-version',
    ])['OTLP_TOKEN']['computed']
    current = read_json([
        'aws', 'secretsmanager', 'get-secret-value', '--region', 'us-east-1',
        '--secret-id', ARN, '--version-stage', 'AWSCURRENT', '--output', 'json',
        '--no-cli-pager',
    ])
    if not isinstance(source, str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,}', source):
        raise RuntimeError('Doppler OTLP_TOKEN is not a valid URL-safe ingestion token')
    destination = current.get('SecretString')
    if not isinstance(destination, str) or not hmac.compare_digest(source, destination):
        raise RuntimeError('Token mismatch: stop adoption; do not overwrite or rotate')
    if current['ARN'] != ARN:
        raise RuntimeError('Unexpected destination ARN')
    print('PASS: Doppler source equals the raw AWS AWSCURRENT token; no writes performed.')
    print('This checks values, not whether a background sync or another stack owns the copy.')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Parsing/transport exceptions can include secret-bearing output.
        print('Preflight failed; diagnostic details withheld to protect secrets.', file=sys.stderr)
        sys.exit(1)
