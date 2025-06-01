import { SpriteBatch } from './spriteBatch.js';

export class WebGPULibrary {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) throw new Error('WebGPU not supported');
        this.scaleFactor = 1;
        this.shaders = new Map();
        this.spriteBatches = new Map();
        this.uniformBuffers = new Map();
        this.bindGroups = new Map();
        this.textures = new Map();
        this.samplers = new Map();
        this.textureCache = new Map();
        this.startTime = performance.now() / 1000;
        this.defaultVertexShader = `
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
            @group(0) @binding(0)
            var<uniform> uniforms: Uniforms;

            @vertex
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                output.position = vec4<f32>(input.position, 0.0, 1.0);
                output.uv = input.uv;
                return output;
            }
        `;
    }

    async initialize() {
        this.adapter = await navigator.gpu.requestAdapter();
        this.device = await this.adapter.requestDevice();
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.uniformBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            ],
            label: 'Uniform Bind Group Layout',
        });

        this.resizeCanvas();
        return this;
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth / this.scaleFactor;
        this.canvas.height = window.innerHeight / this.scaleFactor;
        this.canvas.style.width = `${window.innerWidth}px`;
        this.canvas.style.height = `${window.innerHeight}px`;
    }

    setScaleFactor(newScaleFactor) {
        this.scaleFactor = newScaleFactor;
        this.resizeCanvas();
    }

    createStorageTexture(width, height, format = 'rgba8unorm') {
        const texture = this.device.createTexture({
            size: [width, height],
            format,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            label: `Storage Texture ${width}x${height}`,
        });
        const textureId = `texture_${this.textures.size}`;
        this.textures.set(textureId, { texture, width, height, format });
        return textureId;
    }

    async loadTexture(url, textureId, width = null, height = null) {
        if (this.textureCache.has(url)) {
            const cached = this.textureCache.get(url);
            this.textures.set(textureId, { texture: cached.texture, width: cached.width, height: cached.height, format: 'rgba8unorm' });
            this.samplers.set(textureId, cached.sampler);
            return { textureId, width: cached.width, height: cached.height };
        }

        const response = await fetch(url);
        const imageBitmap = await createImageBitmap(await response.blob());
        const textureWidth = width || imageBitmap.width;
        const textureHeight = height || imageBitmap.height;

        if (textureWidth > imageBitmap.width || textureHeight > imageBitmap.height) {
            throw new Error(`Requested dimensions (${textureWidth}x${textureHeight}) exceed image bounds (${imageBitmap.width}x${imageBitmap.height})`);
        }

        const texture = this.device.createTexture({
            size: [textureWidth, textureHeight],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            label: `Texture ${textureId}`,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture },
            [textureWidth, textureHeight]
        );

        const sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
            label: `Sampler ${textureId}`,
        });

        this.textures.set(textureId, { texture, width: textureWidth, height: textureHeight, format: 'rgba8unorm' });
        this.samplers.set(textureId, sampler);
        this.textureCache.set(url, { texture, sampler, width: textureWidth, height: textureHeight });

        return { textureId, width: textureWidth, height: textureHeight };
    }

    newShader(code, type, label = `Shader ${type}`) {
        const shaderModule = this.device.createShaderModule({ code, label });
        const shaderId = `shader_${this.shaders.size}`;
        this.shaders.set(shaderId, { module: shaderModule, type, code });
        return shaderId;
    }

    setShader(shaderId) {
        const shader = this.shaders.get(shaderId);
        if (!shader) throw new Error(`Shader ${shaderId} not found`);
        this.currentShader = shader;
    }

    send(uniformName, data, type) {
        if (!this.uniformBuffers.has(uniformName)) {
            const size = this.getUniformSize(type, data.length);
            const buffer = this.device.createBuffer({
                size,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: `Uniform Buffer ${uniformName}`,
            });
            this.uniformBuffers.set(uniformName, { buffer, type, size });

            const bindGroup = this.device.createBindGroup({
                layout: this.uniformBindGroupLayout,
                entries: [{ binding: 0, resource: { buffer } }],
                label: `Uniform Bind Group ${uniformName}`,
            });
            this.bindGroups.set(uniformName, bindGroup);
        }

        const bufferData = this.createBufferData(type, data);
        const buffer = this.uniformBuffers.get(uniformName).buffer;
        this.device.queue.writeBuffer(buffer, 0, bufferData);
    }

    getUniformSize(type, length) {
        switch (type) {
            case 'float': return 4 * length;
            case 'vec2<f32>': return 8 * Math.ceil(length / 2);
            case 'vec3<f32>': return 12 * Math.ceil(length / 3);
            case 'vec4<f32>': return 16 * Math.ceil(length / 4);
            default: throw new Error(`Unsupported uniform type: ${type}`);
        }
    }

    createBufferData(type, data) {
        switch (type) {
            case 'float':
            case 'vec2<f32>':
            case 'vec3<f32>':
            case 'vec4<f32>':
                return new Float32Array(data);
            default:
                throw new Error(`Unsupported uniform type: ${type}`);
        }
    }

    newSpriteBatch(maxSprites, vertexShaderId, fragmentShaderId, textureId, hasRotation = false) {
        const vertexShader = this.shaders.get(vertexShaderId) || { module: this.device.createShaderModule({ code: this.defaultVertexShader }), code: this.defaultVertexShader };
        const fragmentShader = this.shaders.get(fragmentShaderId);
        const textureData = this.textures.get(textureId);
        const sampler = this.samplers.get(textureId);

        if (!vertexShader || !fragmentShader || !textureData || !sampler) {
            throw new Error('Invalid shader or texture for sprite batch');
        }

        const batch = new SpriteBatch(this.device, this, {
            spriteWidth: textureId === 'grass' ? 32 : 480,
            spriteHeight: textureId === 'grass' ? 32 : 480,
            sheetWidth: textureId === 'grass' ? 1024 : 1440,
            sheetHeight: textureId === 'grass' ? 1024 : 480,
            maxSprites,
            vertexShaderCode: vertexShader.code,
            fragmentShaderCode: fragmentShader.code,
            textureData: { texture: textureData.texture, sampler },
            uniformBindGroupLayout: this.uniformBindGroupLayout,
            hasRotation,
        });

        const batchId = `batch_${this.spriteBatches.size}`;
        this.spriteBatches.set(batchId, batch);
        return batchId;
    }

    setSpriteBatchData(batchId, spriteData) {
        const batch = this.spriteBatches.get(batchId);
        if (!batch) throw new Error(`Sprite batch ${batchId} not found`);
        batch.setSpriteData(spriteData);
    }

    draw(batchIds, computeBatches = null, allSprites = null, textureIds = null) {
        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        if (computeBatches) {
            const computePass = commandEncoder.beginComputePass();
            if (computeBatches.hero) computeBatches.hero.dispatch(computePass);
            if (computeBatches.tree) computeBatches.tree.dispatch(computePass);
            computePass.end();
        }

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
            }],
        });

        if (batchIds) {
            const ids = Array.isArray(batchIds) ? batchIds : [batchIds];
            for (const batchId of ids) {
                const batch = this.spriteBatches.get(batchId);
                if (batch) {
                    console.log(`Drawing SpriteBatch: ${batchId}`);
                    batch.draw(renderPass);
                }
            }
        }

        if (computeBatches && allSprites && textureIds) {
            let currentBatch = null;
            let currentGroup = [];
            let drawCount = 0;
            let processedSprites = 0;

            console.log(`Processing ${allSprites.length} sprites`);

            for (const sprite of allSprites) {
                const batch = sprite.texture === textureIds.heroTextureId ? computeBatches.hero : computeBatches.tree;
                if (!batch) {
                    console.warn('No batch for sprite:', { y: sprite.y, x: sprite.x, texture: sprite.texture, tile: sprite.tile, xSize: sprite.xSize, ySize: sprite.ySize, index: sprite.index });
                    continue;
                }

                processedSprites++;
                console.log(`Processing sprite ${processedSprites}:`, { y: sprite.y, x: sprite.x, texture: sprite.texture, tile: sprite.tile, xSize: sprite.xSize, ySize: sprite.ySize, index: sprite.index });

                if (batch !== currentBatch && currentGroup.length > 0) {
                    console.log(`Drawing batch ${currentBatch === computeBatches.hero ? 'hero' : 'tree'} with ${currentGroup.length} sprites`, currentGroup.map(s => ({ y: s.y, x: s.x, texture: s.texture, tile: s.tile, index: s.index })));
                    currentBatch.draw(renderPass, currentGroup);
                    drawCount++;
                    currentGroup = [];
                }

                currentBatch = batch;
                currentGroup.push(sprite);
            }

            if (currentGroup.length > 0 && currentBatch) {
                console.log(`Drawing final batch ${currentBatch === computeBatches.hero ? 'hero' : 'tree'} with ${currentGroup.length} sprites`, currentGroup.map(s => ({ y: s.y, x: s.x, texture: s.texture, tile: s.tile, index: s.index })));
                currentBatch.draw(renderPass, currentGroup);
                drawCount++;
            }

            console.log(`Total sprites processed: ${processedSprites}, Total draw calls: ${drawCount}`);
        } else {
            console.warn('Missing computeBatches, allSprites, or textureIds:', { computeBatches, allSprites, textureIds });
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    getDevice() {
        return this.device;
    }

    getContext() {
        return this.context;
    }

    getFormat() {
        return this.format;
    }

    getUniformBindGroupLayout() {
        return this.uniformBindGroupLayout;
    }
}