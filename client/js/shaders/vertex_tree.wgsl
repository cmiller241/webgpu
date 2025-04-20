struct Uniforms {
    pos: vec2<f32>,
}

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn main(
    @location(0) aVertex: vec2<f32>,
    @location(1) aUV: vec2<f32>,
    @location(2) aRotation: f32,
    @location(3) aCenter: vec2<f32>
) -> VertexOutput {
    var output: VertexOutput;

    // Translate vertex to origin relative to center
    let translatedVertex = aVertex - aCenter;

    // Apply rotation
    let cosTheta = cos(aRotation);
    let sinTheta = sin(aRotation);
    let rotatedVertex = vec2<f32>(
        cosTheta * translatedVertex.x - sinTheta * translatedVertex.y,
        sinTheta * translatedVertex.x + cosTheta * translatedVertex.y
    );

    // Translate back to final position
    output.position = vec4<f32>(rotatedVertex + aCenter, 0.0, 1.0);
    output.texCoord = aUV;
    return output;
}