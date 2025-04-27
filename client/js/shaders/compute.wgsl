@group(0) @binding(0) var outputTexture : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : f32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3u) {
    let dims = textureDimensions(outputTexture);
    if (global_id.x >= dims.x || global_id.y >= dims.y) {
        return;
    }

    // Normalized UV coordinates (0 to 1)
    let uv = vec2f(f32(global_id.x) / f32(dims.x), f32(global_id.y) / f32(dims.y));

    // Simple plasma effect
    let t = time * 0.5;
    let value = sin(uv.x * 10.0 + t) * cos(uv.y * 10.0 + t) * 0.5 + 0.5;
    let color = vec3f(
        sin(value * 6.28 + t) * 0.5 + 0.5,
        sin(value * 6.28 + t + 2.0) * 0.5 + 0.5,
        sin(value * 6.28 + t + 4.0) * 0.5 + 0.5
    );

    // Write to texture
    textureStore(outputTexture, vec2i(global_id.xy), vec4f(color, 1.0));
}