struct Position {
    pos: vec2f,     // NDC position (left edge, adjusted for top edge)
    size: vec2f,    // Size in NDC (xSize, ySize)
};

@group(0) @binding(3) var<storage, read> positions: array<Position>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn main(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
    let vertexPositions = array(
        vec2f(-0.5, -0.5), // Bottom-left
        vec2f( 0.5, -0.5), // Bottom-right
        vec2f(-0.5,  0.5), // Top-left
        vec2f( 0.5,  0.5)  // Top-right
    );
    let uvs = array(
        vec2f(0.0, 1.0), // Bottom-left
        vec2f(1.0, 1.0), // Bottom-right
        vec2f(0.0, 0.0), // Top-left
        vec2f(1.0, 0.0)  // Top-right
    );

    let pos = vertexPositions[vertexIndex];
    var output: VertexOutput;
    let centerPos = positions[instanceIndex].pos;
    let size = positions[instanceIndex].size;
    let scaledPos = centerPos + pos * size;
    output.position = vec4f(scaledPos, 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}