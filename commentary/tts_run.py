"""F5-TTS inference: 测试文本.txt -> test_out.wav using 录音.m4a as voice reference."""
import os, sys, time
from pathlib import Path

# Put winget-installed ffmpeg on PATH for pydub / torchcodec
os.environ["PATH"] += os.pathsep + r"C:\Users\time_\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"

import soundfile as sf
from f5_tts.api import F5TTS

BASE = Path(r"E:\TraeProject\clawking\commentary")
REF_WAV = BASE / "ref_clip.wav"
REF_TXT = (BASE / "ref_text.txt").read_text(encoding="utf-8").strip()
GEN_TXT = (BASE / "测试文本.txt").read_text(encoding="utf-8").strip()
OUT_WAV = BASE / "test_out_v2.wav"

print(f"[ref] {REF_WAV.name}  ({REF_WAV.stat().st_size/1024:.0f} KB)")
print(f"[ref_text] {len(REF_TXT)} chars")
print(f"[gen_text] {len(GEN_TXT)} chars")

t0 = time.time()
tts = F5TTS(model="F5TTS_v1_Base")
print(f"[load] {time.time()-t0:.1f}s")

t0 = time.time()
wav, sr, _ = tts.infer(
    ref_file=str(REF_WAV),
    ref_text=REF_TXT,
    gen_text=GEN_TXT,
    speed=1.0,
    nfe_step=32,
    cfg_strength=2.0,
    seed=42,
)
print(f"[infer] {time.time()-t0:.1f}s  -> {len(wav)/sr:.1f}s audio @ {sr}Hz")

sf.write(str(OUT_WAV), wav, sr)
print(f"[out] {OUT_WAV}")
