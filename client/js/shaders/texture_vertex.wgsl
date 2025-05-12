// js/shaders/texture_vertex.wgsl

@group(0) @binding(0) var objectTexture : texture_2d<f32>;
@group(0) @binding(1) var shadowTexture : texture_2d<f32>;
@group(0) @binding(2) var texSampler : sampler;
@group(0) @binding(3) var<storage, read> spriteData : array<SpriteData>;
@group(0) @binding(4) var mapTexture : texture_2d<f32>;

struct SpriteData {
    offsetX: f32,
    offsetY: f32,
    spriteType: f32,
    width: f32,
    height: f32,
    baseY: f32,
    maxShadowDist: f32,
    rotation: f32,
    tileIndex: f32,
};

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

    let sprite = spriteData[instanceIndex];
    let canvasSize = vec2f(1200.0, 800.0);
    let pos = vertexPositions[vertexIndex];
    
    let centerPos = vec2f(
        (sprite.offsetX + sprite.width / 2.0) / canvasSize.x * 2.0 - 1.0,
        1.0 - (sprite.offsetY + sprite.height / 2.0) / canvasSize.y * 2.0
    );
    let size = vec2f(
        sprite.width / canvasSize.x * 2.0,
        sprite.height / canvasSize.y * 2.0
    );
    let scaledPos = centerPos + pos * size;

    var output: VertexOutput;
    output.position = vec4f(scaledPos, 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
}