# Fathom scrape — 2026-09-23

**Source:** Gmail self-email Wed 23 Sep 2026 22:56 PDT (message id `1a0d1fd0fe4f9327`).

| File (local) | Meeting | Duration | Share URL |
|--------------|---------|----------|-----------|
| `Raiyan MM 1.mp4` | Raiyan MM #1 | ~138 min | https://fathom.video/share/-E3CtPJ6RYiDjQyaPRoWDxiZ-a1wbxsJ |
| `Raiyan MM 2.mp4` | Raiyan MM #2 | ~73 min | https://fathom.video/share/nNzsdhHXiS2Gumo6uC1myZgpxsCpjtew |
| `Raiyan MM 3.mp4` | Raiyan MM #3 | ~118 min | https://fathom.video/share/xrgepWi8PViKhRkYEwj-n6Zgq67UoiiC |

**Output dir (gitignored):** `credentials/fathom-scrape/2026-09-23/`

**Re-run download:**

```bash
cd credentials/fathom-scrape/2026-09-23
python3 -m yt_dlp "https://fathom.video/share/-E3CtPJ6RYiDjQyaPRoWDxiZ-a1wbxsJ" -o "Raiyan MM 1.%(ext)s" --merge-output-format mp4 --continue
python3 -m yt_dlp "https://fathom.video/share/nNzsdhHXiS2Gumo6uC1myZgpxsCpjtew" -o "Raiyan MM 2.%(ext)s" --merge-output-format mp4 --continue
python3 -m yt_dlp "https://fathom.video/share/xrgepWi8PViKhRkYEwj-n6Zgq67UoiiC" -o "Raiyan MM 3.%(ext)s" --merge-output-format mp4 --continue
```

Logs: `dl-mm1.log`, `dl-mm2.log`, `dl-mm3.log` in that folder.

**Transcripts (copy_transcript API):**

| Call id | File |
|---------|------|
| 725355469 | `transcript-725355469.txt` (MM #1) |
| 758900481 | `transcript-758900481.txt` (MM #2) |
| 801935913 | `transcript-801935913.txt` (MM #3) |

**Status 2026-09-23 ~23:16 PDT:** `Raiyan MM 3.mp4` **done** (~854 MB). MM #1 ~3% (~1.3 GB total, ~15 min left). MM #2 ~5% (~720 MB total, ~8 min left). Both still downloading.
