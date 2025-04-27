@group(0) @binding(0) var shadowTex: texture_2d<f32>;
@group(0) @binding(1) var shadowSampler: sampler;

@fragment
fn main(
    @location(0) texCoord: vec2<f32>
) -> @location(0) vec4<f32> {
    let color = textureSample(shadowTex, shadowSampler, texCoord);
    return vec4<f32>(0.0, 0.0, 0.0, color.a); // Black shadow with computed alpha
}