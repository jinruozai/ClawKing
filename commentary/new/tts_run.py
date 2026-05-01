"""F5-TTS inference on commentary/new using aligned ref."""
import os
from pathlib import Path
import soundfile as sf

os.environ["PATH"] += os.pathsep + r"C:\Users\time_\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"

BASE = Path(__file__).parent
REF_WAV = BASE / "ref_clip.wav"
REF_TXT = (BASE / "ref_text.txt").read_text(encoding="utf-8").strip()
GEN_TXT = (BASE / "测试文本.txt").read_text(encoding="utf-8").strip()
OUT_WAV = BASE / "test_out.wav"

from f5_tts.api import F5TTS
import time

print(f"[ref]  {len(REF_TXT)} chars  |  {REF_WAV.name}")
print(f"[gen]  {len(GEN_TXT)} chars")

tts = F5TTS(model="F5TTS_v1_Base")
t0 = time.time()
wav, sr, _ = tts.infer(
    ref_file=str(REF_WAV),
    ref_text=REF_TXT,
    gen_text=GEN_TXT,
    speed=1.0,
    nfe_step=32,
    cfg_strength=2.0,
    seed=-1,
    remove_silence=False,
)
print(f"[infer] {time.time()-t0:.1f}s  -> {len(wav)/sr:.1f}s audio @ {sr}Hz")
sf.write(str(OUT_WAV), wav, sr)
print(f"[out] {OUT_WAV}")
