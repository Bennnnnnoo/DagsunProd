"""Copy audio files into public/local-tracks/ for testing the decks on localhost.

usage: python3 scripts/load-local-tracks.py FILE [FILE ...]
       FILE may be "path::Artist::Title" to override the names.

Without an override, "Artist - Title [youtube-id].mp3" is split on the first
dash. Each track's embedded cover (if any) is centre-cropped to a square.
Writes public/local-tracks/tracks.json, which the decks load at runtime.

public/local-tracks/ is git-ignored: this is test audio only and must not be
committed or deployed. Real label releases should replace it.
Needs ffmpeg.
"""
import json, os, re, shutil, subprocess, sys

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "local-tracks")
COVER_SIZE = 320

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)

tracks = []
for n, arg in enumerate(sys.argv[1:], start=1):
    path, *names = arg.split("::")
    stem = re.sub(r"\s*\[[^\]]+\]$", "", os.path.splitext(os.path.basename(path))[0]).strip()
    if len(names) == 2:
        artist, title = names
    elif re.search(r"\s[-–]\s", stem):
        artist, title = (s.strip() for s in re.split(r"\s[-–]\s", stem, maxsplit=1))
    else:
        artist, title = "Unknown artist", stem
    # 'All Night' (ft. John B) -> All Night (ft. John B)
    quoted = re.match(r"^(['\"])(.*?)\1(.*)$", title)
    if quoted:
        title = quoted.group(2) + quoted.group(3)

    audio = f"{n:02d}.mp3"
    shutil.copyfile(path, os.path.join(OUT, audio))
    cover = f"{n:02d}.jpg"
    made = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", path, "-an", "-frames:v", "1",
         "-vf", f"crop='min(iw,ih)':'min(iw,ih)',scale={COVER_SIZE}:{COVER_SIZE}",
         os.path.join(OUT, cover)],
    ).returncode == 0
    tracks.append({"artist": artist, "title": title, "src": f"/local-tracks/{audio}",
                   "cover": f"/local-tracks/{cover}" if made else None})
    print(f"{n:02d}  {artist} — {title}" + ("" if made else "  (no cover)"))

with open(os.path.join(OUT, "tracks.json"), "w") as f:
    json.dump(tracks, f, indent=2, ensure_ascii=False)
