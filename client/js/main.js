import { WebGPULibrary } from './webgpu.js';

let gpu, heroTextureId, treeTextureId, vertexShaderId, fragmentShaderId;
let cameraX = 500, cameraY = 500, cameraSpeed = 5; // Center in 1000x1000
let keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
let lastTime = performance.now();
let frameTimes = [];
const maxFrameTimes = 60;
let time = 0;
let allSprites = [];

async function init() {
    try {
        gpu = await new WebGPULibrary('webgpuCanvas').initialize();
        gpu.setScaleFactor(1);
        console.log('Canvas size:', gpu.getContext().canvas.width, gpu.getContext().canvas.height);

        const treeTextureInfo = await gpu.loadTexture('assets/tree3.png', 'tree', 1440, 480);
        const heroTextureInfo = await gpu.loadTexture('assets/hero.png', 'hero');
        heroTextureId = heroTextureInfo.textureId;
        treeTextureId = treeTextureInfo.textureId;
        console.log('Texture IDs:', { hero: heroTextureId, tree: treeTextureId });

        const vertexShaderCode = `
            struct VertexInput {
                @location(0) position: vec2<f32>,
                @location(1) uv: vec2<f32>,
            };
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>,
            };
            struct Uniforms {
                resolution: vec2<f32>,
            };
            @group(0) @binding(2) var<uniform> uniforms: Uniforms;

            @vertex
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                let ndcPos = vec2<f32>((input.position.x / uniforms.resolution.x) * 2.0 - 1.0, 1.0 - (input.position.y / uniforms.resolution.y) * 2.0);
                output.position = vec4<f32>(ndcPos, 0.0, 1.0);
                output.uv = input.uv;
                return output;
            }
        `;
        const fragmentShaderCode = `
            @group(0) @binding(0) var tex: texture_2d<f32>;
            @group(0) @binding(1) var samp: sampler;

            @fragment
            fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let color = textureSample(tex, samp, uv);
                return color;
            }
        `;
        const computeShaderCode = await fetch('js/shaders/custom_compute.wgsl').then(r => r.text());
        vertexShaderId = gpu.newShader(vertexShaderCode, 'vertex');
        fragmentShaderId = gpu.newShader(fragmentShaderCode, 'fragment');
        const computeShaderId = gpu.newShader(computeShaderCode, 'compute');
        console.log('Shader IDs:', { vertex: vertexShaderId, fragment: fragmentShaderId, compute: computeShaderId });

        console.log('Creating hero compute batch...');
        const heroComputeBatchId = await gpu.setupComputePipeline(heroTextureId, computeShaderId, 112, 112, 10000);
        console.log('Creating tree compute batch...');
        const treeComputeBatchId = await gpu.setupComputePipeline(treeTextureId, computeShaderId, 480, 480, 2000);

        // Generate 100 sprites
        for (let i = 0; i < 1000; i++) {
            const isHero = i < 880;
            const x = Math.random() * 1000;
            const y = Math.random() * 1000;
            allSprites.push({
                x: x,
                y: y,
                xSize: isHero ? 112 : 480,
                ySize: isHero ? 112 : 480,
                tile: 0,
                rotation: 0,
                texture: isHero ? heroTextureId : treeTextureId,
                baseY: isHero ? 80.0 : 250.0,
                index: i + 1
            });
        }
        console.log('Sprites initialized:', allSprites.length, { heroes: allSprites.filter(s => s.texture === heroTextureId).length, trees: allSprites.filter(s => s.texture === treeTextureId).length });

        window.addEventListener('keydown', (e) => {
            if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
            if (e.key === 'z') {
                let newScale = Math.min(gpu.scaleFactor + 0.05, 4);
                gpu.setScaleFactor(newScale);
                console.log(`scaleFactor increased to: ${newScale}`);
            } else if (e.key === 'x') {
                let newScale = Math.max(gpu.scaleFactor - 0.05, 1);
                gpu.setScaleFactor(newScale);
                console.log(`scaleFactor decreased to: ${newScale}`);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
        });

        window.addEventListener('resize', () => gpu.resizeCanvas());

        console.log('init completed');
    } catch (error) {
        console.error('Error in init:', error);
        throw error;
    }
}

function tick() {
    const canvasWidth = gpu.getContext().canvas.width;
    const canvasHeight = gpu.getContext().canvas.height;

    if (keys.ArrowLeft) cameraX -= cameraSpeed;
    if (keys.ArrowRight) cameraX += cameraSpeed;
    if (keys.ArrowUp) cameraY -= cameraSpeed;
    if (keys.ArrowDown) cameraY += cameraSpeed;

    cameraX = Math.max(0, Math.min(cameraX, 1000 - canvasWidth / gpu.scaleFactor));
    cameraY = Math.max(0, Math.min(cameraY, 1000 - canvasHeight / gpu.scaleFactor));

    const currentTime = performance.now();
    const deltaTime = Math.min(currentTime - lastTime, 100); // Cap deltaTime
    lastTime = currentTime;
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;
    frameTimes.push(fps);
    if (frameTimes.length > maxFrameTimes) frameTimes.shift();
    const avgFps = frameTimes.reduce((sum, fps) => sum + fps, 0) / frameTimes.length;
    document.getElementById('fpsDisplay').textContent = `FPS: ${Math.round(avgFps)}`;

    time += deltaTime / 1000;
}

function render() {
    if (!gpu.getContext()) {
        console.warn('WebGPU context lost');
        return;
    }

    const renderSprites = allSprites.map(sprite => ({
        ...sprite,
        x: sprite.x - cameraX,
        y: sprite.y - cameraY
    }));

    renderSprites.sort((a, b) => {
        const aBaseY = a.y + a.baseY;
        const bBaseY = b.y + b.baseY;
        if (aBaseY !== bBaseY) return aBaseY - bBaseY;
        return a.index - b.index;
    });

    console.log('Sprite count:', renderSprites.length, { heroes: renderSprites.filter(s => s.texture === heroTextureId).length, trees: renderSprites.filter(s => s.texture === treeTextureId).length });

    gpu.drawComputes(renderSprites, time, vertexShaderId, fragmentShaderId);
}

export async function main() {
    try {
        await init();
        function gameLoop(currentTime) {
            tick();
            render();
            requestAnimationFrame(gameLoop);
        }
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('Error in main:', error);
    }
}