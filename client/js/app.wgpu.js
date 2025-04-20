import { WebGPUSetup } from './webgpu.js';
import { Game } from './game.js';
import { loadTexture } from './loadTexture.js';
import { SpriteBatch } from './spriteBatch.js';


async function init() {
    const response = await fetch('js/map.json');
    const mapData = await response.json();

    const webgpu = new WebGPUSetup('webglCanvas');
    await webgpu.initialize();

    const device = webgpu.getDevice();

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
        uniformBindGroupLayout: webgpu.getUniformBindGroup().layout, // Pass layout
        hasRotation: false, // No rotation
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

    const game = new Game([grassBatch, treeBatch], webgpu, mapData);

    function gameLoop(time) {
        webgpu.updateTime(); // Update time uniform
        const commandEncoder = device.createCommandEncoder();
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
}

init().catch(console.error);