struct Uniforms {
    pos: vec2<f32>,
    rotation: f32,
}
@group(1) @binding(0) var<uniform> uniforms: Uniforms;
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};
@vertex
fn main(@location(0) aVertex: vec2<f32>, @location(1) aUV: vec2<f32>) -> VertexOutput {
    var output: VertexOutput;
    let cosR = cos(uniforms.rotation);
    let sinR = sin(uniforms.rotation);
    let rotatedX = aVertex.x * cosR - aVertex.y * sinR;
    let rotatedY = aVertex.x * sinR + aVertex.y * cosR;
    let finalPos = vec2<f32>(rotatedX, rotatedY) + uniforms.pos;
    output.position = vec4<f32>(finalPos, 0.0, 1.0);
    output.texCoord = aUV;
    return output;
}