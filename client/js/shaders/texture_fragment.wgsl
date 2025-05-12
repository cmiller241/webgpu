// js/shaders/texture_fragment.wgsl

@group(0) @binding(0) var objectTexture : texture_2d<f32>;
@group(0) @binding(1) var shadowTexture : texture_2d<f32>;
@group(0) @binding(2) var texSampler : sampler;
@group(0) @binding(3) var<storage, read> spriteData : array<f32>; // Changed to read-only
@group(0) @binding(4) var mapTexture : texture_2d<f32>;

struct FragmentInput {
    @location(0) uv: vec2f,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
    // Sample all textures
    let mapColor = textureSample(mapTexture, texSampler, input.uv);
    let shadowColor = textureSample(shadowTexture, texSampler, input.uv);
    let objectColor = textureSample(objectTexture, texSampler, input.uv);

    // Composite: shadows darken map, objects render on top
    if (objectColor.a > 0.0) {
        return objectColor;
    }

    // Blend shadow with map (shadows darken grass, not objects)
    let shadowedMap = mapColor * (1.0 - shadowColor.a) + vec4f(shadowColor.rgb * shadowColor.a, mapColor.a);
    return shadowedMap;
}