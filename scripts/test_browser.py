"""Run a browser regression with the checkout path passed to Ego's Node bridge."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('test', choices=['btw', 'btw-completion', 'btw-frame-limit', 'btw-invalidation', 'compact-margins', 'window-rail', 'branch-tree'])
args = parser.parse_args()
root = Path(os.environ.get('CHATSPRIG_ROOT') or Path(__file__).resolve().parent.parent).resolve()
source = (root / 'tests' / 'browser' / f'{args.test}.mjs').read_text()
# Ego executes streamed code in a separate process whose cwd/environment may
# differ from the caller's. Pass the resolved path explicitly in the script.
source = f'globalThis.qaRoot = {json.dumps(str(root))};\n' + source
sys.exit(subprocess.run(['ego-browser', 'nodejs'], input=source, text=True).returncode)
