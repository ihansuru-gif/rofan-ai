#!/usr/bin/env bash
set -euo pipefail
ROOT="$1"
FILE="$ROOT/app/src/main/java/com/bulbyeot/simplerecorder/storage/RecordingFileManager.java"
python3 - "$FILE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
old='try { retriever.release(); } catch (RuntimeException e) { Log.w("SimpleRecorder", "Metadata retriever release failed", e); }'
new='try { retriever.release(); } catch (Exception e) { Log.w("SimpleRecorder", "Metadata retriever release failed", e); }'
if old in s:
    s=s.replace(old,new)
elif new not in s:
    raise SystemExit("expected release handler not found")
p.write_text(s)
PY
