"""Prepare an aligned reference for F5-TTS:
- Runs pydub silence-split like F5 does internally (~10s clip)
- Transcribes that clip with Whisper so ref_text exactly matches ref_audio
Outputs: ref_clip.wav + ref_text.txt
"""
import os
from pathlib import Path
from pydub import AudioSegment, silence

os.environ["PATH"] += os.pathsep + r"C:\Users\time_\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"

BASE = Path(r"E:\TraeProject\clawking\commentary")
SRC = BASE / "录音.m4a"
OUT_WAV = BASE / "ref_clip.wav"
OUT_TXT = BASE / "ref_text.txt"

aseg = AudioSegment.from_file(str(SRC))
print(f"[src] {len(aseg)/1000:.2f}s")

# replicate F5 logic
segs = silence.split_on_silence(aseg, min_silence_len=1000, silence_thresh=-50, keep_silence=1000, seek_step=10)
clip = AudioSegment.silent(duration=0)
for s in segs:
    if len(clip) > 6000 and len(clip + s) > 12000:
        break
    clip += s

if len(clip) > 12000:
    segs = silence.split_on_silence(aseg, min_silence_len=100, silence_thresh=-40, keep_silence=1000, seek_step=10)
    clip = AudioSegment.silent(duration=0)
    for s in segs:
        if len(clip) > 6000 and len(clip + s) > 12000:
            break
        clip += s

if len(clip) > 12000:
    clip = clip[:12000]

clip = clip.set_frame_rate(24000).set_channels(1)
clip.export(str(OUT_WAV), format="wav")
print(f"[clip] {len(clip)/1000:.2f}s -> {OUT_WAV.name}")

# transcribe
from faster_whisper import WhisperModel
model = WhisperModel("small.en", device="cuda", compute_type="int8_float32")
segments, info = model.transcribe(str(OUT_WAV), language="en", beam_size=5)
text = " ".join(s.text.strip() for s in segments).strip()
OUT_TXT.write_text(text, encoding="utf-8")
print(f"[ref_text] {len(text)} chars")
print(f"           {text}")
