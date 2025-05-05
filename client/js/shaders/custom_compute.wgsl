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
        outputColor = vec4<f32>(inputColor.rgb * tint, inputColor.a);
        // Early return to ensure sprite pixels are untouched by shadow logic
        textureStore(outputTexture, outputCoord, outputColor);
        return;
    }

    // Shadow calculation: Check if this pixel is a shadow target
    let pixelX = f32(global_id.x);
    let pixelY = f32(global_id.y); // Y in texture coordinates (0 to 111)
    let baseY = 80.0; // Base of sprite (feet) at y = 84

    // Time-of-day angle (one day = 24 seconds)
    let dayFraction = fract(time / 24.0); // 0.0 to 1.0
    let theta = (dayFraction - 0.25) * 2.0 * 3.14159265359; // Align 6 AM to 0°
    let cosTheta = cos(theta);
    let sinTheta = sin(theta);

    // Check pixels within max shadow distance
    let maxD = baseY; // Max source distance (y = 0 to baseY)
    let maxShadowDist = 0.5 * maxD; // Halved distance

    // Compute relative position to base
    let dx = pixelX - uv.x * f32(dims.x); // Approximate sprite center
    let dy = pixelY - baseY;
    let dist = sqrt(dx * dx + dy * dy);

    // Check if pixel is within shadow range and in the correct direction
    if (dist < maxShadowDist && dist > 0.0) {
        // Normalize direction to pixel
        let dirX = dx / dist;
        let dirY = dy / dist;

        // Check if pixel direction aligns with shadow direction (cosθ, sinθ)
        let dotProduct = dirX * cosTheta + dirY * sinTheta;
        if (dotProduct > 0.0) { // Allow some angular tolerance (cos(45°) ≈ 0.707)
            // Compute source pixel
            let dPrime = dist; // Shadow distance
            let sourceD = 2.0 * dPrime; // Full distance (d' = 0.5 * d)
            let sourceY = baseY - sourceD;
            let sourceX = pixelX - dPrime * cosTheta;

            // Check if source pixel is within bounds and above base
            if (sourceX >= 0.0 && sourceX < f32(dims.x) && sourceY >= 0.0 && sourceY < baseY) {
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