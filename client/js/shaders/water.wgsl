struct Wave {
    freqY : f32,
    speed : f32,
    amplitude : f32,
    phase : f32,
};

@group(0) @binding(0) var outputTexture : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : f32;

const waveCount = 12;
const waves : array<Wave, waveCount> = array<Wave, waveCount>(
    Wave(10.0, 0.3, 0.10, 0.0),
    Wave(5.0, 0.45, 0.05, 1.0),
    Wave(8.0, 0.25, 0.03, 0.5),
    Wave(15.0, 0.5, 0.06, 2.0),
    Wave(10.0, 0.6, 0.02, 1.5),
    Wave(7.0, 0.4, 0.04, 0.7),
    Wave(12.0, 0.35, 0.03, 1.2),
    Wave(9.0, 0.5, 0.02, 0.8),
    Wave(13.0, 0.55, 0.015, 1.8),
    Wave(11.0, 0.3, 0.025, 0.3),
    Wave(16.0, 0.48, 0.02, 1.0),
    Wave(14.0, 0.5, 0.018, 1.6),
);

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    let dims = textureDimensions(outputTexture);
    if (global_id.x >= dims.x || global_id.y >= dims.y) {
        return;
    }

    let uv = vec2f(f32(global_id.x) / f32(dims.x), f32(global_id.y) / f32(dims.y));
    let t = time;

    // ✨ Parametric scaling
    let waveScale = 3.0;
    let uv_scaled = uv * waveScale;

    // ✨ Gentle sideways bending
    let bendFrequency = 2.0;  // How often it bends left/right
    let bendSpeed = 0.05;      // How fast the bend animates
    let bendStrength = 0.1;  // How much side-bending happens

    let bend = sin(uv_scaled.x * bendFrequency + t * bendSpeed) * bendStrength;

    // ✨ Upward movement
    let verticalSpeed = 0.1;  // How fast the whole pattern moves up

    var waveHeight = 0.0;
    for (var i = 0u; i < waveCount; i = i + 1u) {
        let w = waves[i];
        let y = uv_scaled.y + bend;
        waveHeight += sin((y + t * verticalSpeed) * w.freqY + w.phase) * w.amplitude;
    }

    // Deep and shallow water colors
    let deepColor = vec3f(0.05, 0.25, 0.4);
    let shallowColor = vec3f(0.2, 0.7, 0.8);

    let shallowFactor = clamp(1.0 - uv.y * 2.0, 0.0, 1.0);
    let baseColor = mix(deepColor, shallowColor, shallowFactor);

    let highlight = clamp(waveHeight * 1.0, 0.0, 0.6);
    let color = baseColor + vec3f(highlight, highlight * 0.9, highlight * 0.7);

    let noise = fract(sin(dot(uv + vec2f(t * 0.1), vec2f(12.9898, 78.233))) * 43758.5453) * 0.08;
    let finalColor = clamp(color + vec3f(noise * 0.1, noise * 0.05, noise * 0.05), vec3f(0.0), vec3f(1.0));

    textureStore(outputTexture, vec2i(global_id.xy), vec4f(finalColor, 1.0));
}