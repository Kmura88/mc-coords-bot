// シード値からバイオーム地図(RGB)を生成する小さな共有ライブラリ。
// cubiomes を利用。構造物（村・神殿など）は意図的に一切扱わない。
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include "generator.h"
#include "biomenoise.h"
#include "util.h"

// out_rgb: W*H*3 バイト。(cx, cz) が画像中心、1ピクセル = bpp ブロック。
// shade != 0 のとき概算地形高さから陰影を付ける。
int render_map(uint64_t seed, int mc, int cx, int cz, int bpp,
               int W, int H, int shade, unsigned char *out_rgb)
{
    static unsigned char colors[256][3];
    static int colors_ready = 0;
    if (!colors_ready) { initBiomeColors(colors); colors_ready = 1; }

    Generator g;
    setupGenerator(&g, mc, 0);
    applySeed(&g, DIM_OVERWORLD, seed);
    SurfaceNoise sn;
    initSurfaceNoise(&sn, DIM_OVERWORLD, seed);

    int x0 = cx - (W * bpp) / 2;
    int z0 = cz - (H * bpp) / 2;
    float *hgt = malloc(sizeof(float) * W * H);
    int *ids = malloc(sizeof(int) * W * H);
    if (!hgt || !ids) {
        free(hgt);
        free(ids);
        return -1;
    }

    for (int j = 0; j < H; j++) {
        for (int i = 0; i < W; i++) {
            int bx = x0 + i * bpp, bz = z0 + j * bpp;
            float y;
            // mapApproxHeight は 1:4 座標系。返されるバイオームは Y=0 のもの
            // （地下の洞窟バイオームが混ざる）なので高さだけ使う
            mapApproxHeight(&y, NULL, &g, &sn, bx >> 2, bz >> 2, 1, 1);
            hgt[j * W + i] = y;
            // バイオームは地表の高さ（海は海面）で取る
            int sy = y < 63.0f ? 63 : (int)y;
            ids[j * W + i] = getBiomeAt(&g, 4, bx >> 2, sy >> 2, bz >> 2);
        }
    }

    for (int j = 0; j < H; j++) {
        for (int i = 0; i < W; i++) {
            int id = ids[j * W + i];
            if (id < 0 || id > 255) id = 0;
            float r = colors[id][0], gg = colors[id][1], b = colors[id][2];
            if (shade) {
                // 北西からの光で簡易ヒルシェード
                int il = i > 0 ? i - 1 : i, jt = j > 0 ? j - 1 : j;
                float h = hgt[j * W + i];
                float dx = h - hgt[j * W + il];
                float dz = h - hgt[jt * W + i];
                float k = 1.0f + (dx + dz) * 0.08f / (bpp < 4 ? 1.0f : bpp / 4.0f);
                // 標高による明るさ（高いほど明るい）
                k *= 0.85f + 0.3f * fminf(fmaxf((h - 40.0f) / 160.0f, 0.0f), 1.0f);
                if (k < 0.5f) k = 0.5f;
                if (k > 1.4f) k = 1.4f;
                r *= k; gg *= k; b *= k;
            }
            unsigned char *p = out_rgb + 3 * (j * W + i);
            p[0] = r > 255 ? 255 : (unsigned char)r;
            p[1] = gg > 255 ? 255 : (unsigned char)gg;
            p[2] = b > 255 ? 255 : (unsigned char)b;
        }
    }
    free(ids);
    free(hgt);
    return 0;
}

int mc_newest(void) { return MC_NEWEST; }
