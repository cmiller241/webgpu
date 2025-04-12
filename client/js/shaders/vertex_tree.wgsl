struct Uniforms {
    pos: vec2<f32>,  // The translation (position) of the sprite batch
}

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn main(
    @location(0) aVertex: vec2<f32>,  // Vertex position
    @location(1) aUV: vec2<f32>      // Texture coordinate
) -> VertexOutput {
    var output: VertexOutput;

    // Compute rotation based on X position
    // scale factor determines how "fast" the rotation changes
    let scale: f32 = 0.05; // tweak this value to control curve strength
    let rotationAngle = aVertex.x * scale;

    let cosTheta = cos(rotationAngle);
    let sinTheta = sin(rotationAngle);

    let rotatedVertex = vec2<f32>(
        cosTheta * aVertex.x - sinTheta * aVertex.y,
        sinTheta * aVertex.x + cosTheta * aVertex.y
    );

    output.position = vec4<f32>(rotatedVertex + uniforms.pos, 0.0, 1.0);
    output.texCoord = aUV;
    return output;
}

