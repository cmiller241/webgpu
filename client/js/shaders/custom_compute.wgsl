// js/shaders/custom_compute.wgsl

// Output textures
@group(0) @binding(0) var objectTexture : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var shadowTexture : texture_storage_2d<rgba8unorm, write>;

// Uniforms: time, canvas dimensions
struct Uniforms {
    time: f32,
    canvasWidth: f32,
    canvasHeight: f32,
    padding: f32,
}
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

// Input texture and sampler
@group(0) @binding(3) var inputTexture : texture_2d<f32>;
@group(0) @binding(4) var inputSampler : sampler;

// Sprite data
struct SpriteData {
    offsetX: f32,        // Canvas x position
    offsetY: f32,        // Canvas y position
    spriteType: u32,     // 0=hero, 1=tree
    width: f32,          // 112 or 480
    height: f32,         // 112 or 480
    baseY: f32,          // 80 or 400
    maxShadowDist: f32,  // 40 or 100
    rotation: f32,       // Tree sway or 0
    tileIndex: f32,      // 0=base, 1=top for trees, 0 for heroes
}
@group(0) @binding(5) var<storage, read> spriteData : array<SpriteData>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>, @builtin(workgroup_id) workgroup_id : vec3<u32>) {
    let outputCoord = vec2<i32>(global_id.xy);
    let canvasDims = vec2<f32>(uniforms.canvasWidth, uniforms.canvasHeight);
    
    // Ensure pixel is within canvas
    if (outputCoord.x >= i32(canvasDims.x) || outputCoord.y >= i32(canvasDims.y)) {
        return;
    }

    // Initialize outputs
    var objectColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var shadowColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // Sprite index (assuming one sprite per workgroup)
    let spriteIndex = workgroup_id.z;
    if (spriteIndex >= arrayLength(&spriteData)) {
        return;
    }
    let sprite = spriteData[spriteIndex];

    // Pixel position in canvas
    let pixelPos = vec2<f32>(f32(outputCoord.x), f32(outputCoord.y));

    // Transform pixel to sprite local coordinates
    let spriteCenter = vec2<f32>(sprite.offsetX + sprite.width / 2.0, sprite.offsetY + sprite.height / 2.0);
    let relPos = pixelPos - spriteCenter;
    let cosR = cos(sprite.rotation);
    let sinR = sin(sprite.rotation);
    let rotatedPos = vec2<f32>(
        relPos.x * cosR + relPos.y * sinR,
        -relPos.x * sinR + relPos.y * cosR
    );
    let texCoord = rotatedPos + vec2<f32>(sprite.width / 2.0, sprite.height / 2.0);

    // Check if pixel is within sprite bounds
    if (texCoord.x >= 0.0 && texCoord.x < sprite.width && texCoord.y >= 0.0 && texCoord.y < sprite.height) {
        // Compute UV coordinates
        var uv: vec2<f32>;
        if (sprite.spriteType == 0u) {
            // Hero: 112x112
            uv = vec2<f32>(texCoord.x / sprite.width, texCoord.y / sprite.height);
        } else {
            // Tree: 1440x480, select base or top
            let texX = texCoord.x + sprite.tileIndex * 480.0;
            uv = vec2<f32>(texX / 1440.0, texCoord.y / 480.0);
        }

        // Sample texture
        let inputColor = textureSampleLevel(inputTexture, inputSampler, uv, 0.0);
        if (inputColor.a > 0.0) {
            objectColor = inputColor;
        }
    }

    // Shadow calculation
    let pixelY = pixelPos.y;
    let shadowBaseY = sprite.offsetY + sprite.baseY;
    let dy = pixelY - shadowBaseY;
    if (dy > 0.0 && dy < sprite.maxShadowDist) {
        // Static shadow angle (45 degrees for simplicity)
        let theta = 0.785398; // π/4
        let cosTheta = cos(theta);
        let sinTheta = sin(theta);

        // Project back to source pixel
        let dPrime = dy / sinTheta;
        let sourceX = pixelPos.x - dPrime * cosTheta;
        let sourceY = shadowBaseY - dPrime;
        let sourcePos = vec2<f32>(sourceX, sourceY) - vec2<f32>(sprite.offsetX, sprite.offsetY);
        
        // Rotate source position
        let sourceRotated = vec2<f32>(
            sourcePos.x * cosR + sourcePos.y * sinR,
            -sourcePos.x * sinR + sourcePos.y * cosR
        );
        let sourceTexCoord = sourceRotated + vec2<f32>(sprite.width / 2.0, sprite.height / 2.0);

        // Check if source is within sprite
        if (sourceTexCoord.x >= 0.0 && sourceTexCoord.x < sprite.width &&
            sourceTexCoord.y >= 0.0 && sourceTexCoord.y < sprite.height) {
            var sourceUV: vec2<f32>;
            if (sprite.spriteType == 0u) {
                sourceUV = vec2<f32>(sourceTexCoord.x / sprite.width, sourceTexCoord.y / sprite.height);
            } else {
                let texX = sourceTexCoord.x + sprite.tileIndex * 480.0;
                sourceUV = vec2<f32>(texX / 1440.0, sourceTexCoord.y / 480.0);
            }
            let sourceColor = textureSampleLevel(inputTexture, inputSampler, sourceUV, 0.0);
            if (sourceColor.a > 0.0) {
                shadowColor = vec4<f32>(0.0, 0.0, 0.05, 0.8); // Dark shadow, alpha 0.8
            }
        }
    }

    // Write to output textures
    textureStore(objectTexture, outputCoord, objectColor);
    textureStore(shadowTexture, outputCoord, shadowColor);
}