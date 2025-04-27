@group(0) @binding(0) var<storage, read> treeData: array<vec4<f32>>; // x, y, rotation, padding
@group(0) @binding(1) var<storage, read_write> shadowTexture: array<u32>;
@group(0) @binding(2) var<uniform> params: ShadowParams;

struct ShadowParams {
    lightDir: vec2<f32>, // Normalized light direction (e.g., [-0.707, -0.707] for top-left)
    shadowSize: vec2<f32>, // Shadow dimensions (e.g., [480, 480])
    textureSize: vec2<u32>, // Shadow texture size (e.g., [480, numTrees * 480])
    numTrees: u32, // Number of visible trees
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let treeIdx = id.z;
    if (treeIdx >= params.numTrees) { return; }

    let tree = treeData[treeIdx];
    let pos = tree.xy; // Tree position in pixel space (pre-offset by camera)
    let rotation = tree.z;

    let x = id.x;
    let y = id.y;
    if (x >= params.shadowSize.x || y >= params.shadowSize.y) { return; }

    // Compute pixel position in shadow texture
    let texIdx = (treeIdx * u32(params.shadowSize.y) + y) * u32(params.textureSize.x) + x;

    // Transform pixel to local tree space
    let localPos = vec2<f32>(f32(x) - params.shadowSize.x * 0.5, f32(y) - params.shadowSize.y * 0.5);

    // Apply inverse rotation to align with tree
    let cosTheta = cos(-rotation);
    let sinTheta = sin(-rotation);
    let rotatedPos = vec2<f32>(
        cosTheta * localPos.x - sinTheta * localPos.y,
        sinTheta * localPos.x + cosTheta * localPos.y
    );

    // Project shadow based on light direction
    let shadowOffset = params.lightDir * 100.0; // Adjust offset strength
    let shadowPos = rotatedPos + shadowOffset;

    // Simple elliptical shadow
    let radiusX = params.shadowSize.x * 0.3; // Narrower shadow
    let radiusY = params.shadowSize.y * 0.5;
    let dist = length(shadowPos / vec2<f32>(radiusX, radiusY));
    let alpha = clamp(1.0 - dist, 0.0, 1.0) * 0.5; // Semi-transparent shadow

    // Store shadow as RGBA (grayscale with alpha)
    shadowTexture[texIdx] = u32(alpha * 255.0) | (u32(alpha * 255.0) << 8) | (u32(alpha * 255.0) << 16) | (u32(alpha * 255.0) << 24);
}