/**
 * renderer.wgpu.js
 * 
 * This module defines the Renderer class, which is responsible for managing 
 * all WebGPU-based rendering operations for sprites and text textures.
 * 
 * Responsibilities include:
 * - Creating and managing the vertex buffer used for rendering batches of sprites.
 * - Loading image textures and converting them into WebGPU-compatible formats.
 * - Generating text textures using an offscreen canvas for in-game text rendering.
 * - Batching and rendering multiple sprite instances efficiently to the screen.
 * - Rendering arbitrary textures (e.g., text) at specific positions using NDC coordinates.
 * 
 * Constructor Parameters:
 * - `device`: The WebGPU device used for buffer and texture operations.
 * - `renderPipeline`: The compiled render pipeline for drawing operations.
 * - `bindGroupLayout`: The bind group layout for texture and sampler bindings.
 * - `webgpu`: Instance of WebGPUSetup, used for canvas size and context access.
 * - `uniformBindGroup`: The bind group for uniform values (e.g., time, resolution).
 * 
 * This class is designed to be reusable and scalable for large numbers of sprites.
 */

export class Renderer {
    constructor(device, renderPipeline, bindGroupLayout, webgpu, uniformBindGroup) {
        this.device = device;
        this.renderPipeline = renderPipeline;
        this.bindGroupLayout = bindGroupLayout;
        this.webgpu = webgpu; // Store WebGPUSetup instance for context access
        this.uniformBindGroup = uniformBindGroup; // Store the uniform bind group
        
        this.maxGrassSprites = 4096; // Enough for 2673 + growth
        this.maxTreeSprites = 500;   // Enough for 113 + growth
        this.spriteBuffer = this.device.createBuffer({
            size: this.maxGrassSprites * 6 * 4 * 4, // 288000 bytes
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.treeBuffer = this.device.createBuffer({
            size: this.maxTreeSprites * 6 * 4 * 4, // 48000 bytes
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    async loadTexture(imageUrl) {
        if (!this.textureCache) {
            this.textureCache = new Map();
        }
    
        if (this.textureCache.has(imageUrl)) {
            return this.textureCache.get(imageUrl);
        }
    
        const img = new Image();
        img.src = imageUrl;
        await img.decode();
    
        const bitmap = await createImageBitmap(img);
        const texture = this.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
    
        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: texture },
            [bitmap.width, bitmap.height]
        );
    
        const sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
        });
    
        const textureData = { texture, sampler };
        this.textureCache.set(imageUrl, textureData);
    
        return textureData;
    }
    

    async createTextTexture(text, font, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 200;
        const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
        const offCtx = offscreen.getContext('2d');
        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.font = font;
        offCtx.fillStyle = color;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.fillText(text, offscreen.width / 2, offscreen.height / 2);
        
        const bitmap = await createImageBitmap(offscreen);
        
        const texture = this.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: texture },
            [bitmap.width, bitmap.height]
        );

        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        return { texture, sampler };
    }

    drawSpritesBatch(spriteData, textureData, renderPass) {
        if (spriteData.length === 0) return;

        const { texture, sampler } = textureData;
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;

        const vertexData = new Float32Array(spriteData.length * 24);
        for (let i = 0; i < spriteData.length; i++) {
            const { x, y, tile } = spriteData[i];
            const spriteWidth = 32, spriteHeight = 32;
            const spritesheetWidth = 1024, spritesheetHeight = 1024;

            const tilesPerRow = spritesheetWidth / spriteWidth;
            const spriteX = (tile % tilesPerRow) * spriteWidth;
            const spriteY = Math.floor(tile / tilesPerRow) * spriteHeight;
            const u0 = spriteX / spritesheetWidth;
            const v0 = spriteY / spritesheetHeight;
            const u1 = u0 + spriteWidth / spritesheetWidth;
            const v1 = v0 + spriteHeight / spritesheetHeight;

            const left = (2 * x / canvasWidth) - 1;
            const right = (2 * (x + spriteWidth) / canvasWidth) - 1;
            const top = 1 - (2 * y / canvasHeight);
            const bottom = 1 - (2 * (y + spriteHeight) / canvasHeight);

            const offset = i * 24;
            vertexData[offset] = left; vertexData[offset + 1] = top; vertexData[offset + 2] = u0; vertexData[offset + 3] = v0;
            vertexData[offset + 4] = left; vertexData[offset + 5] = bottom; vertexData[offset + 6] = u0; vertexData[offset + 7] = v1;
            vertexData[offset + 8] = right; vertexData[offset + 9] = bottom; vertexData[offset + 10] = u1; vertexData[offset + 11] = v1;
            vertexData[offset + 12] = left; vertexData[offset + 13] = top; vertexData[offset + 14] = u0; vertexData[offset + 15] = v0;
            vertexData[offset + 16] = right; vertexData[offset + 17] = bottom; vertexData[offset + 18] = u1; vertexData[offset + 19] = v1;
            vertexData[offset + 20] = right; vertexData[offset + 21] = top; vertexData[offset + 22] = u1; vertexData[offset + 23] = v0;
        }

        console.log('Grass sprites count:', spriteData.length, 'Buffer size written:', vertexData.byteLength);
        this.device.queue.writeBuffer(this.spriteBuffer, 0, vertexData);

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: sampler },
            ],
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setVertexBuffer(0, this.spriteBuffer);
        renderPass.setBindGroup(0, bindGroup); // Texture and sampler
        renderPass.setBindGroup(1, this.uniformBindGroup); // Uniforms
        renderPass.draw(spriteData.length * 6, 1, 0, 0);
    }

    drawTreeSpritesBatch(spriteData, textureData, renderPass) {
        if (spriteData.length === 0) return;
    
        const { texture, sampler } = textureData;
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
    
        const treeWidth = 480, treeHeight = 480; // Hardcoded tree size
        const spritesheetWidth = 1440, spritesheetHeight = 480;
    
        const vertexData = new Float32Array(spriteData.length * 24); // 6 vertices * 4 floats each
        for (let i = 0; i < spriteData.length; i++) {
            const { x, y, tile } = spriteData[i];
    
            // UV coordinates for tree sprite (assuming tile 512 is at a specific position)
            const tilesPerRow = Math.floor(spritesheetWidth / treeWidth);
            const spriteX = (tile % tilesPerRow) * treeWidth; // Adjust if trees are in a different atlas position
            const spriteY = Math.floor(tile / tilesPerRow) * treeHeight;
            const u0 = spriteX / spritesheetWidth;
            const v0 = spriteY / spritesheetHeight;
            const u1 = u0 + treeWidth / spritesheetWidth;
            const v1 = v0 + treeHeight / spritesheetHeight;
    
            // NDC coordinates
            const left = (2 * x / canvasWidth) - 1;
            const right = (2 * (x + treeWidth) / canvasWidth) - 1;
            const top = 1 - (2 * y / canvasHeight);
            const bottom = 1 - (2 * (y + treeHeight) / canvasHeight);
    
            const offset = i * 24;
            vertexData[offset] = left; vertexData[offset + 1] = top; vertexData[offset + 2] = u0; vertexData[offset + 3] = v0;
            vertexData[offset + 4] = left; vertexData[offset + 5] = bottom; vertexData[offset + 6] = u0; vertexData[offset + 7] = v1;
            vertexData[offset + 8] = right; vertexData[offset + 9] = bottom; vertexData[offset + 10] = u1; vertexData[offset + 11] = v1;
            vertexData[offset + 12] = left; vertexData[offset + 13] = top; vertexData[offset + 14] = u0; vertexData[offset + 15] = v0;
            vertexData[offset + 16] = right; vertexData[offset + 17] = bottom; vertexData[offset + 18] = u1; vertexData[offset + 19] = v1;
            vertexData[offset + 20] = right; vertexData[offset + 21] = top; vertexData[offset + 22] = u1; vertexData[offset + 23] = v0;
        }
    
        // Reuse the same spriteBuffer or create a dedicated one if tree count differs significantly
        console.log('Tree sprites count:', spriteData.length, 'Buffer size written:', vertexData.byteLength);
        this.device.queue.writeBuffer(this.treeBuffer, 0, vertexData);
    
        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: sampler },
            ],
        });
    
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setVertexBuffer(0, this.treeBuffer);
        renderPass.setBindGroup(0, bindGroup);
        console.log('Tree bind group set:', bindGroup);
        renderPass.setBindGroup(1, this.uniformBindGroup);
        renderPass.draw(spriteData.length * 6, 1, 0, 0);
    }

    renderTexture(textureData, position, renderPass, width = 256, height = 64) {
        const { texture, sampler } = textureData;
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;

        const ndcWidth = (width / canvasWidth) * 2.0;
        const ndcHeight = (height / canvasHeight) * 2.0;
        const [x, y] = position;
        const left = x - ndcWidth / 2;
        const right = x + ndcWidth / 2;
        const top = y + ndcHeight / 2;
        const bottom = y - ndcHeight / 2;

        const vertexData = new Float32Array([
            left, top, 0.0, 0.0,
            left, bottom, 0.0, 1.0,
            right, bottom, 1.0, 1.0,
            left, top, 0.0, 0.0,
            right, bottom, 1.0, 1.0,
            right, top, 1.0, 0.0,
        ]);

        const vertexBuffer = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, vertexData);

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: sampler },
            ],
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setBindGroup(0, bindGroup); // Texture and sampler
        renderPass.setBindGroup(1, this.uniformBindGroup); // Uniforms
        renderPass.draw(6, 1, 0, 0);
    }
}