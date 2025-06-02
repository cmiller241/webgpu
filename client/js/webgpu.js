export class WebGPULibrary {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.device = null;
        this.context = null;
        this.scaleFactor = 1;
        this.textures = new Map();
        this.shaders = new Map();
        this.batches = new Map();
        this.computePipelines = new Map();
        this.uniformBuffers = new Map();
        this.sampler = null;
    }

    async initialize() {
        if (!navigator.gpu) throw new Error('WebGPU not supported');

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter found');

        this.device = await adapter.requestDevice();
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) throw new Error(`Canvas with ID "${this.canvasId}" not found`);

        this.context = canvas.getContext('webgpu');
        if (!this.context) throw new Error('Failed to get WebGPU context.');

        this.resizeCanvas();
        this.context.configure({
            device: this.device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: 'premultiplied',
        });

        this.sampler = this.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });

        return this;
    }

    resizeCanvas() {
        if (!this.context) {
            throw new Error('WebGPU context not initialized. Call initialize() first.');
        }
        const canvas = this.context.canvas;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.min(window.innerWidth * dpr * this.scaleFactor, 1280);
        canvas.height = Math.min(window.innerHeight * dpr * this.scaleFactor, 720);
        console.log('Canvas resized:', canvas.width, canvas.height);
    }

    setScaleFactor(scale) {
        this.scaleFactor = scale;
        this.resizeCanvas();
        return this;
    }

    async loadTexture(url, name, width, height) {
        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        const actualWidth = width || bitmap.width;
        const actualHeight = height || bitmap.height;
        console.log(`Loading texture ${name}: ${actualWidth}x${actualHeight}`);

        const texture = this.device.createTexture({
            size: [actualWidth, actualHeight, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: texture },
            [actualWidth, actualHeight]
        );

        const textureId = name;
        this.textures.set(textureId, { texture, width: actualWidth, height: actualHeight });
        return { textureId, width: actualWidth, height: actualHeight };
    }

    newShader(code, type) {
        const shaderModule = this.device.createShaderModule({ code });
        const shaderId = `${type}_${this.shaders.size}`;
        this.shaders.set(shaderId, { module: shaderModule, type });
        return shaderId;
    }

    newSpriteBatch(maxSprites, vertexShaderId, fragmentShaderId, textureId, isCompute = false) {
        const vertexBuffer = this.device.createBuffer({
            size: maxSprites * 4 * 16, // 4 vertices, 4 floats (16 bytes each)
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        const indexBuffer = this.device.createBuffer({
            size: maxSprites * 6 * 4, // 6 indices per quad, 4 bytes each
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        const uniformBuffer = this.device.createBuffer({
            size: 8, // resolution: vec2<f32>
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([this.context.canvas.width, this.context.canvas.height]));

        const vertexShader = this.shaders.get(vertexShaderId);
        const fragmentShader = this.shaders.get(fragmentShaderId);
        if (!vertexShader || !fragmentShader) {
            throw new Error(`Shader not found: vertex=${vertexShaderId}, fragment=${fragmentShaderId}`);
        }

        const texture = this.textures.get(textureId).texture;

        const pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: {} },
                    ],
                })],
            }),
            vertex: {
                module: vertexShader.module,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 16, // 4 floats
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32x2' },
                    ],
                }],
            },
            fragment: {
                module: fragmentShader.module,
                entryPoint: 'main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }],
            },
            primitive: { topology: 'triangle-list' },
        });

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: uniformBuffer } },
            ],
        });

        const batchId = `batch_${this.batches.size}`;
        this.batches.set(batchId, {
            vertexBuffer,
            indexBuffer,
            uniformBuffer,
            pipeline,
            bindGroup,
            maxSprites,
            spriteCount: 0,
            textureId,
            isCompute,
        });

        this.uniformBuffers.set(batchId, uniformBuffer);
        return batchId;
    }

    async setupComputePipeline(textureId, computeShaderId, width, height, maxSprites) {
        const textureInfo = this.textures.get(textureId);
        const computeShader = this.shaders.get(computeShaderId);

        console.log(`Setting up compute pipeline for ${textureId}: ${width}x${height}`);

        const outputTexture = this.device.createTexture({
            size: [width, height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        const timeBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const pipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.device.createBindGroupLayout({
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {} },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
                        { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: {} },
                    ],
                })],
            }),
            compute: {
                module: computeShader.module,
                entryPoint: 'main',
            },
        });

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: outputTexture.createView() },
                { binding: 1, resource: { buffer: timeBuffer } },
                { binding: 2, resource: textureInfo.texture.createView() },
                { binding: 3, resource: this.sampler },
            ],
        });

        const computeBatchId = `compute_${textureId}`;
        this.computePipelines.set(computeBatchId, {
            pipeline,
            bindGroup,
            outputTexture,
            timeBuffer,
            width,
            height,
            maxSprites,
        });

        this.textures.set(computeBatchId, { texture: outputTexture, width, height });
        return computeBatchId;
    }

    async drawComputes(sprites, time, vertexShaderId, fragmentShaderId) {
        if (sprites.length === 0 || !this.context) {
            console.warn('No sprites or context lost');
            return;
        }

        const commandEncoder = this.device.createCommandEncoder();

        // Group sprites by texture, preserving y-sort order
        const batches = [];
        let currentTexture = sprites[0].texture;
        let currentBatch = { textureId: currentTexture, sprites: [] };
        for (const sprite of sprites) {
            if (sprite.texture !== currentTexture) {
                batches.push(currentBatch);
                currentTexture = sprite.texture;
                currentBatch = { textureId: currentTexture, sprites: [] };
            }
            currentBatch.sprites.push(sprite);
        }
        batches.push(currentBatch);

        // Compute passes (one per sprite to avoid clipping)
        for (const batch of batches) {
            const computeBatchId = `compute_${batch.textureId}`;
            const computeBatch = this.computePipelines.get(computeBatchId);
            if (computeBatch) {
                console.log(`Processing compute batch: ${computeBatchId}, sprites: ${batch.sprites.length}`);
                this.device.queue.writeBuffer(computeBatch.timeBuffer, 0, new Float32Array([time]));
                for (const sprite of batch.sprites) {
                    const computePass = commandEncoder.beginComputePass();
                    computePass.setPipeline(computeBatch.pipeline);
                    computePass.setBindGroup(0, computeBatch.bindGroup);
                    computePass.dispatchWorkgroups(
                        Math.ceil(computeBatch.width / 8),
                        Math.ceil(computeBatch.height / 8)
                    );
                    computePass.end();
                }
            }
        }

        // Render passes
        const textureView = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });

        const batchIdsToClean = [];
        for (const batch of batches) {
            const computeBatchId = `compute_${batch.textureId}`;
            const computeBatch = this.computePipelines.get(computeBatchId);
            if (computeBatch) {
                console.log(`Rendering batch: ${computeBatchId}, sprites: ${batch.sprites.length}`);
                const vertices = new Float32Array(batch.sprites.length * 4 * 4);
                const indices = new Uint32Array(batch.sprites.length * 6);

                for (let i = 0; i < batch.sprites.length; i++) {
                    const sprite = batch.sprites[i];
                    const x = sprite.x;
                    const y = sprite.y;
                    const w = sprite.xSize;
                    const h = sprite.ySize;

                    const baseVertex = i * 4;
                    vertices.set([
                        x, y, 0, 0,
                        x + w, y, 1, 0,
                        x + w, y + h, 1, 1,
                        x, y + h, 0, 1,
                    ], baseVertex * 4);

                    indices.set([
                        baseVertex, baseVertex + 1, baseVertex + 2,
                        baseVertex, baseVertex + 2, baseVertex + 3,
                    ], i * 6);
                }

                const tempBatchId = this.newSpriteBatch(batch.sprites.length, vertexShaderId, fragmentShaderId, computeBatchId);
                const tempBatch = this.batches.get(tempBatchId);

                this.device.queue.writeBuffer(tempBatch.vertexBuffer, 0, vertices);
                this.device.queue.writeBuffer(tempBatch.indexBuffer, 0, indices);
                tempBatch.spriteCount = batch.sprites.length;

                renderPass.setPipeline(tempBatch.pipeline);
                renderPass.setBindGroup(0, tempBatch.bindGroup);
                renderPass.setVertexBuffer(0, tempBatch.vertexBuffer);
                renderPass.setIndexBuffer(tempBatch.indexBuffer, 'uint32');
                renderPass.drawIndexed(tempBatch.spriteCount * 6);

                batchIdsToClean.push(tempBatchId);
            }
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // Cleanup after submission
        for (const batchId of batchIdsToClean) {
            const batch = this.batches.get(batchId);
            if (batch) {
                batch.vertexBuffer.destroy();
                batch.indexBuffer.destroy();
                batch.uniformBuffer.destroy();
                this.batches.delete(batchId);
                this.uniformBuffers.delete(batchId);
            }
        }
    }

    getContext() {
        return this.context;
    }

    getDevice() {
        return this.device;
    }
}