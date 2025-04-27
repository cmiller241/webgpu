@group(0) @binding(0) var myTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

@fragment
fn main(
    @location(0) texCoord: vec2<f32>
) -> @location(0) vec4<f32> {
    // Sample both current pixel and shadow offset pixel unconditionally
    let texColor = textureSample(myTexture, mySampler, texCoord);

    // Shadow parameters
    let shadowAngle = 0.8; // 45 degrees in radians (π/4)
    let shadowDistance = 0.02; // Distance to check for shadow (adjust as needed)
    let texSize = vec2<f32>(textureDimensions(myTexture));
    let texelSize = vec2<f32>(1.0 / texSize.x, 1.0 / texSize.y);
    let shadowDir = vec2<f32>(cos(shadowAngle), sin(shadowAngle));
    let shadowOffset = shadowDir * shadowDistance;
    let shadowTexCoord = clamp(texCoord - shadowOffset, vec2<f32>(0.0), vec2<f32>(1.0));
    let shadowSample = textureSample(myTexture, mySampler, shadowTexCoord);

    // Decide output based on sampled colors
    // If current pixel is opaque, return its color
    if (texColor.a > 0.0) {
        return texColor;
    }
    // If current pixel is transparent and shadow offset pixel is opaque, render shadow
    if (shadowSample.a > 0.0) {
        return vec4<f32>(0.0, 0.0, 0.1, 0.7); // Semi-transparent black shadow
    }

    // Otherwise, keep transparent
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}