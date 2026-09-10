#include <wasm_simd128.h>

// Planar channels are accumulated separately to preserve phase-inverted speech.
// SIMD reduces four samples per iteration; double totals limit accumulation error.
__attribute__((export_name("accumulate")))
void accumulate(const float *samples, double *energy, unsigned length,
                double sample_rate, double rate, unsigned frames) {
  for (unsigned frame = 0; frame < frames; ++frame) {
    unsigned start = (unsigned)(frame * sample_rate / rate);
    unsigned end = (unsigned)((frame + 1) * sample_rate / rate);
    if (end > length) end = length;
    v128_t sum = wasm_f64x2_splat(0);
    unsigned i = start;
    for (; i + 4 <= end; i += 4) {
      v128_t x = wasm_v128_load(samples + i);
      v128_t lo = wasm_f64x2_promote_low_f32x4(x);
      v128_t hi = wasm_f64x2_promote_low_f32x4(wasm_i32x4_shuffle(x, x, 2, 3, 0, 1));
      sum = wasm_f64x2_add(sum, wasm_f64x2_mul(lo, lo));
      sum = wasm_f64x2_add(sum, wasm_f64x2_mul(hi, hi));
    }
    double total = wasm_f64x2_extract_lane(sum, 0) + wasm_f64x2_extract_lane(sum, 1);
    for (; i < end; ++i) total += (double)samples[i] * samples[i];
    energy[frame] += total;
  }
}
