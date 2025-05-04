// js/shaders/custom_compute.wgsl
@group(0) @binding(0) var outputTexture : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : f32;
@group(0) @binding(2) var inputTexture : texture_2d<f32>;
@group(0) @binding(3) var inputSampler : sampler;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let dims = textureDimensions(inputTexture);
    let uv = vec2<f32>(f32(global_id.x) / f32(dims.x), f32(global_id.y) / f32(dims.y));
    
    // Read color from input texture
    let inputColor = textureSampleLevel(inputTexture, inputSampler, uv, 0.0);
    
    // Check for white or near-white pixels (within a threshold) or transparent pixels
    let whiteThreshold = 0.05; // Allow pixels close to white (e.g., RGB = [0.95, 0.95, 0.95])
    let isWhite = all(abs(inputColor.rgb - vec3<f32>(1.0)) < vec3<f32>(whiteThreshold));
    let isTransparent = inputColor.a == 0.0;
    
    var outputColor : vec4<f32>;
    if (isWhite || isTransparent) {
        outputColor = vec4<f32>(0.0, 0.0, 0.0, 0.0); // Transparent output
    } else {
        // Apply a time-based tint effect to non-white, non-transparent pixels
        let tint = vec3<f32>(0.5 + 0.5 * sin(time), 0.8, 0.8);
        outputColor = vec4<f32>(inputColor.rgb * tint, inputColor.a);
    }
    
    // Write to output texture
    textureStore(outputTexture, vec2<i32>(global_id.xy), outputColor);
}