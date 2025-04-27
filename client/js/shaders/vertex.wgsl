struct Uniforms {
    pos: vec2<f32>,
}

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

// Define the output struct for the vertex shader
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn main(
    @location(0) aVertex: vec2<f32>,
    @location(1) aUV: vec2<f32>
) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(aVertex, 0.0, 1.0);
    output.texCoord = aUV;
    return output;
}