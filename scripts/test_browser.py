"""Compatibility entry point for the offline Playwright/Chromium regressions."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
sys.exit(subprocess.run(['node', str(root / 'scripts' / 'test_browser.mjs'), *sys.argv[1:]], cwd=root).returncode)
