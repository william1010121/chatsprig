"""Export the approved GPT Image artwork to Chrome icon sizes (macOS sips)."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/branding/chatsprig-icon-concept.png'

for size in (16, 32, 48, 128):
    output = ROOT / 'icons' / f'icon{size}.png'
    subprocess.run(['sips', '-z', str(size), str(size), str(SOURCE), '--out', str(output)], check=True, capture_output=True)
    print(output.relative_to(ROOT))
