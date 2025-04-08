/**
 * app.wgpu.js
 * 
 * This is the main entry point for initializing and running the WebGPU-based game.
 * 
 * It performs the following:
 * - Loads the game map data from a JSON file.
 * - Sets up the WebGPU rendering context and pipeline using custom shaders.
 * - Initializes the Renderer and Game logic with loaded resources.
 * - Loads sprite and text textures for rendering.
 * - Runs the main game loop which updates game logic and draws each frame.
 * - Handles window resize events to ensure the canvas scales correctly.
 * 
 * Dependencies:
 * - WebGPUSetup: Handles WebGPU device/context initialization and shader compilation.
 * - Renderer: Manages texture loading and rendering.
 * - Game: Encapsulates the game update/render logic.
 */

import { WebGPUSetup } from './webgpu.js';
import { Renderer } from './renderer.wgpu.js';
import { Game } from './game.js';

async function init() {
    const response = await fetch('js/map.json');
    const mapData = await response.json();

    const webgpu = new WebGPUSetup('webglCanvas');
    await webgpu.initialize();
    await webgpu.createPipeline('js/shaders/vertex.wgsl', 'js/shaders/fragment.wgsl');

    const device = webgpu.getDevice();
    const renderer = new Renderer(
        device,
        webgpu.getPipeline(),
        webgpu.getBindGroupLayout(),
        webgpu, // Pass WebGPUSetup for context access
        webgpu.getUniformBindGroup() // Pass uniform bind group
    );
    const texture = await renderer.loadTexture('assets/sprites2.png');
    const treeTexture = await renderer.loadTexture('assets/tree3.png');
    const textTexture = await renderer.createTextTexture("Hello WebGPU!", "48pt Lucida Console", "white");

    const game = new Game(renderer, webgpu, mapData); // Pass webgpu instance

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
        game.render(texture, treeTexture,renderPass);
        renderer.renderTexture(textTexture, [0.0, 0.0], renderPass);
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