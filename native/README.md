# C audio kernel

`lip-energy.c` computes per-channel window energy using WebAssembly SIMD and double-precision accumulation. The shared compute Worker uses it for mouth animation, with the existing JavaScript implementation as a fallback when WebAssembly cannot load or allocate memory. Normalization and motion planning remain shared JavaScript. FFmpeg already provides native H.264/AAC encoding; rendering and frame-bound reduction remain WebGL shaders.

Rebuild with LLVM Clang and wasm-ld on PATH: `npm run build:native`. The tiny compiled `renderer/wasm/lip-energy.wasm` is committed and included by the existing renderer packaging rule, so users need no compiler or native DLL installation. Linux CI rebuilds the C source and checks reference parity; Windows tests check the shipped binary.

Local Apple Silicon comparison (60 seconds, stereo, 48 kHz; includes input copies and normalization, warmed module, eight runs): JS about 5.2–8.0 ms, C SIMD about 3.1–6.2 ms. This is the audio-analysis stage only, not whole-export speed. Intel/AMD timings require target hardware. Each task gets fresh scratch memory, and the compiled module is cached. The existing one-Worker CPU budget is unchanged.
