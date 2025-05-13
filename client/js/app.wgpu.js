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
        console.log('Canvas size after init:', webgpu.getContext().canvas.width, webgpu.getContext().canvas.height);
        console.log('Device pixel ratio:', window.devicePixelRatio);

        const device = webgpu.getDevice();
        console.log('WebGPU format:', webgpu.format);

        // Grouped texture loading
        const grassTextureData = await loadTexture(device, 'assets/sprites2.png');
        const treeTextureData = await loadTexture(device, 'assets/tree3.png');
        const heroTextureData = await loadTexture(device, 'assets/hero.png', 120, 120);
        console.log("All textures loaded");

        // Create sprite batches
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

        // Initialize compute batch with array of textures
        console.log("Initializing ComputeTextureBatch...");
        const computeBatch = new ComputeTextureBatch(device, webgpu, 112, 112, 10000, [heroTextureData.texture, treeTextureData.texture]);
        await computeBatch.init();
        console.log('ComputeTextureBatch init completed, initialized:', computeBatch.isInitialized());
        if (!computeBatch.isInitialized()) {
            throw new Error('ComputeTextureBatch failed to initialize. Check console for details.');
        }

        // Load custom compute shader
        let customComputeShader;
        try {
            customComputeShader = await fetch('js/shaders/custom_compute.wgsl').then(r => r.text());
            await computeBatch.setComputeShader(customComputeShader);
            console.log('Custom compute shader applied');
        } catch (error) {
            console.warn('Failed to load or apply custom compute shader:', error);
        }

        // Create game instance with pre-loaded texture
        const game = new Game([grassBatch], webgpu, mapData, computeBatch, heroTextureData);

        // FPS calculation variables
        let lastTime = performance.now();
        const frameTimes = [];
        const maxFrameTimes = 60; // Store last 60 frames for moving average

        async function gameLoop(time) {
            // Calculate FPS
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            // Calculate FPS (1000 / deltaTime for frames per second)
            const fps = deltaTime > 0 ? 1000 / deltaTime : 0;
            frameTimes.push(fps);
            if (frameTimes.length > maxFrameTimes) {
                frameTimes.shift(); // Remove oldest frame
            }

            // Compute average FPS
            const avgFps = frameTimes.reduce((sum, fps) => sum + fps, 0) / frameTimes.length;

            // Update FPS display
            const fpsDisplay = document.getElementById('fpsDisplay');
            if (fpsDisplay) {
                fpsDisplay.textContent = `FPS: ${Math.round(avgFps)}`;
            }

            webgpu.updateTime();
            computeBatch.updateTime(time);

            const commandEncoder = device.createCommandEncoder();

            // Always run compute pass to apply shader effect
            const computePass = commandEncoder.beginComputePass();
            computeBatch.dispatch(computePass);
            computePass.end();

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: webgpu.getContext().getCurrentTexture().createView(),
                    loadOp: 'clear', // Clear the framebuffer
                    storeOp: 'store',
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, // Transparent black
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