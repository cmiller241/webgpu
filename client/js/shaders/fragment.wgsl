@group(0) @binding(0) var myTexture: texture_2d<f32>;
@group(0) @binding(1) var mySampler: sampler;

@fragment
fn main(
    @location(0) texCoord: vec2<f32> // Match the vertex output
) -> @location(0) vec4<f32> {
    let texColor = textureSample(myTexture, mySampler, texCoord);
    return texColor;
}