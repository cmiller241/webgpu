struct Uniforms {
    size: vec2f,     // Size in NDC (width, height)
    position: vec2f, // Position in NDC (x, y)
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let positions = array(
        vec2f(0.0, 0.0), // Bottom-left
        vec2f(1.0, 0.0), // Bottom-right
        vec2f(0.0, 1.0), // Top-left
        vec2f(1.0, 1.0)  // Top-right
    );
    let uvs = array(
        vec2f(0.0, 1.0), // Bottom-left
        vec2f(1.0, 1.0), // Bottom-right
        vec2f(0.0, 0.0), // Top-left
        vec2f(1.0, 0.0)  // Top-right
    );

    let pos = positions[vertexIndex];
    var output: VertexOutput;
    let scaledPos = pos * uniforms.size + uniforms.position;
    output.position = vec4f(scaledPos, 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}