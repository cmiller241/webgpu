// js/shaders/custom_compute.wgsl
@group(0) @binding(0) var outputTexture : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : f32;
@group(0) @binding(2) var inputTexture : texture_2d<f32>;
@group(0) @binding(3) var inputSampler : sampler;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    // Use input texture dimensions (112x112)
    let dims = textureDimensions(inputTexture);
    let outputCoord = vec2<i32>(global_id.xy);

    // UV coordinates (0.0 to 1.0)
    let uv = vec2<f32>(f32(global_id.x) / f32(dims.x), f32(global_id.y) / f32(dims.y));

    // Initialize output color (transparent by default)
    var outputColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Process sprite pixel
    let inputColor = textureSampleLevel(inputTexture, inputSampler, uv, 0.0);
    let isOpaque = inputColor.a > 0.0;

    if (isOpaque) {
        // Apply red tint to opaque pixels
        let tint = vec3<f32>(0.5 + 0.5 * sin(time), 0.8, 0.8);
        outputColor = vec4<f32>(inputColor.rgb, inputColor.a);
        // Early return to ensure sprite pixels are untouched by shadow logic
        textureStore(outputTexture, outputCoord, outputColor);
        return;
    }

    // Shadow calculation: Check if this transparent pixel is a shadow target
    let pixelX = f32(global_id.x);
    let pixelY = f32(global_id.y);
    let baseY = 80.0; // Base of sprite (feet) at y = 80

    // Time-based angle (continuous 0° to 360° over 24 seconds)
    let theta = fract(time / 720.0) * 2.0 * 3.14159265359; // 0 to 2π
    let cosTheta = cos(theta);
    let sinTheta = sin(theta);

    // Check pixels within max shadow distance
    let maxD = baseY; // Max source distance (y = 0 to baseY)
    let maxShadowDist = 0.5 * maxD; // Halved distance

    // General case: project along (cosθ, sinθ)
    if (abs(sinTheta) >= 0.01) { // Skip shadows near 0° and 180°
        let dy = pixelY - baseY;
        let dPrime = dy / sinTheta; // d' = (pixelY - baseY) / sin(θ)
        if (abs(dPrime) < maxShadowDist) {
            let sourceX = pixelX - dPrime * cosTheta;
            let sourceY = baseY - 2.0 * dPrime; // d' = 0.5 * (baseY - sourceY)
            if (sourceX >= 0.0 && sourceX < f32(dims.x) && sourceY >= 0.0 && sourceY < f32(dims.y)) {
                let sourceUV = vec2<f32>(sourceX / f32(dims.x), sourceY / f32(dims.y));
                let sourceColor = textureSampleLevel(inputTexture, inputSampler, sourceUV, 0.0);
                if (sourceColor.a > 0.0) {
                    outputColor = vec4<f32>(0.0, 0.0, 0.05, 0.8); // Pure black shadow, alpha 0.8
                }
            }
        }
    }

    // Write to output texture
    textureStore(outputTexture, outputCoord, outputColor);
}