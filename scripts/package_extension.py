"""Build a release ZIP using an explicit runtime-file allowlist."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
files = [root / name for name in ('manifest.json', 'background.js', 'rules.json')]
for directory, suffixes in [('content', {'.js'}), ('shared', {'.js', '.mjs'}), ('options', {'.html', '.css', '.js'}), ('icons', {'.png'})]:
    files.extend(p for p in (root / directory).iterdir() if p.is_file() and p.suffix in suffixes)
output = root / 'dist' / f'chatsprig-{manifest["version"]}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, path.relative_to(root))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'manifest.json' in archive.namelist()
print(output)
