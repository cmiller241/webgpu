import { WebGPUSetup } from './webgpu.js';
import { Game } from './game.js';
import { loadTexture } from './loadTexture.js';
import { SpriteBatch } from './spriteBatch.js';
import { ComputeTextureBatch } from './ComputeTextureBatch.js';

async function init() {
    try {
        const response = await fetch('js/map.json');
        if (!response.ok) {
            throw new Error(`Failed to load map.json: ${response.statusText}`);
        }
        const mapData = await response.json();

        const webgpu = new WebGPUSetup('webgpuCanvas');
        await webgpu.initialize();

        const device = webgpu.getDevice();
        console.log('WebGPU format:', webgpu.format);

        const grassTextureData = await loadTexture(device, 'assets/sprites2.png');
        const treeTextureData = await loadTexture(device, 'assets/tree3.png');
        console.log("Textures loaded");

        const grassBatch = new SpriteBatch(device, webgpu, {
            spriteWidth: 32,
            spriteHeight: 32,
            sheetWidth: 1024,
            sheetHeight: 1024,
            maxSprites: 4096,
            vertexShaderCode: await fetch('js/shaders/vertex.wgsl').then(r => r.text()),
            fragmentShaderCode: await fetch('js/shaders/fragment.wgsl').then(r => r.text()),
            textureData: grassTextureData,
            uniformBindGroupLayout: webgpu.getUniformBindGroup().layout,
            hasRotation: false,
        });
        const treeBatch = new SpriteBatch(device, webgpu, {
            spriteWidth: 480,
            spriteHeight: 480,
            sheetWidth: 1440,
            sheetHeight: 480,
            maxSprites: 5000,
            vertexShaderCode: await fetch('js/shaders/vertex_tree.wgsl').then(r => r.text()),
            fragmentShaderCode: await fetch('js/shaders/fragment.wgsl').then(r => r.text()),
            textureData: treeTextureData,
            uniformBindGroupLayout: webgpu.getUniformBindGroup().layout,
            hasRotation: true,
        });

        console.log("Initializing ComputeTextureBatch...");
        const computeBatch = new ComputeTextureBatch(device, webgpu, 512, 512);
        await computeBatch.init(); // Explicitly await init
        console.log('ComputeTextureBatch init completed, initialized:', computeBatch.isInitialized());
        if (!computeBatch.isInitialized()) {
            throw new Error('ComputeTextureBatch failed to initialize. Check console for details.');
        }
        console.log("ComputeTextureBatch initialized successfully");

        const game = new Game([grassBatch, treeBatch], webgpu, mapData, computeBatch);

        function gameLoop(time) {
            webgpu.updateTime();
            computeBatch.updateTime(time);

            const commandEncoder = device.createCommandEncoder();

            const computePass = commandEncoder.beginComputePass();
            computeBatch.dispatch(computePass);
            computePass.end();

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: webgpu.getContext().getCurrentTexture().createView(),
                    loadOp: 'load',
                    storeOp: 'store',
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                }],
            });

            game.update();
            game.render(renderPass);
            renderPass.end();

            device.queue.submit([commandEncoder.finish()]);
            requestAnimationFrame(gameLoop);
        }

        requestAnimationFrame(gameLoop);

        window.addEventListener('resize', () => {
            webgpu.resizeCanvas();
        });
    } catch (error) {
        console.error('Initialization failed:', error);
        throw error;
    }
}

init().catch(error => {
    console.error('Error in init:', error);
});