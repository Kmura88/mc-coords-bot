"""シード値から地図タイル（Leaflet 用）を生成して worker/public/tiles に書き出す。

使い方:  python3 gen_tiles.py <シード値> [--radius 12288]

構造物（村・神殿・遺跡など）は意図的に一切扱わない。
ズーム z のタイル1枚(256px)は 256 * 2**(MAX_ZOOM - z) * 4 ブロック四方。
"""
import argparse
import ctypes
import json
import shutil
import time
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "worker" / "public" / "tiles"
TILE = 256
BPP = 4          # 最大ズームでの 1ピクセルあたりブロック数（地形計算の解像度と同じ）
MAX_ZOOM = 2     # 最大ズーム (1px=4ブロック)。それ以下は縮小して作る
MIN_ZOOM = 0     # 最小ズーム (1px=16ブロック)


def render(seed, radius):
    lib = ctypes.CDLL(str(HERE / "libmapgen.so"))
    lib.render_map.argtypes = [
        ctypes.c_uint64, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_char_p,
    ]
    size = radius * 2 // BPP
    buf = ctypes.create_string_buffer(size * size * 3)
    # 画像の左上が (-radius, -radius) になるよう中心を (0,0) にする
    if lib.render_map(seed & 0xFFFFFFFFFFFFFFFF, lib.mc_newest(), 0, 0, BPP, size, size, 1, buf) != 0:
        raise SystemExit("地図の生成に失敗しました（メモリ不足の可能性があります。--radius を小さくしてください）")
    return Image.frombytes("RGB", (size, size), buf.raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("seed", type=int, help="ワールドのシード値")
    ap.add_argument("--radius", type=int, default=12288,
                    help="原点からの描画範囲（ブロック）。4096 の倍数に切り上げ")
    args = ap.parse_args()

    unit = TILE * BPP * 2 ** (MAX_ZOOM - MIN_ZOOM)  # 最小ズームのタイル1枚の幅
    radius = -(-args.radius // unit) * unit

    t = time.time()
    print(f"地形を計算中... (±{radius} ブロック)")
    img = render(args.seed, radius)
    print(f"  {time.time() - t:.0f} 秒")

    if OUT.exists():
        shutil.rmtree(OUT)
    count = 0
    for z in range(MAX_ZOOM, MIN_ZOOM - 1, -1):
        if z != MAX_ZOOM:
            img = img.resize((img.width // 2, img.height // 2), Image.Resampling.BOX)
        n = img.width // TILE
        off = n // 2  # 原点がタイル境界に来る
        for ty in range(n):
            d = OUT / str(z) / str(ty - off)
            d.mkdir(parents=True, exist_ok=True)
            for tx in range(n):
                tile = img.crop((tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE))
                tile.save(d / f"{tx - off}.webp", quality=88, method=4)
                count += 1
    (OUT / "meta.json").write_text(json.dumps({"radius": radius, "maxNativeZoom": MAX_ZOOM,
                                                "minZoom": MIN_ZOOM, "blocksPerPixel": BPP}))
    print(f"タイル {count} 枚を {OUT} に出力しました")


if __name__ == "__main__":
    main()
