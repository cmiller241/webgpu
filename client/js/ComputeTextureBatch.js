export class ComputeTextureBatch {
    constructor(device, webgpu, textureWidth, textureHeight, maxInstances = 1000, textures = null) {
        this.device = device;
        this.webgpu = webgpu;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
        this.maxInstances = maxInstances;
        this.textures = textures;
        if (this.textures?.hero) this.textures.hero.label = 'Hero Texture';
        if (this.textures?.tree) this.textures.tree.label = 'Tree Texture';
        this.initialized = false;
        this.initializationError = null;
        this.currentComputeShaderCode = null;

        this.init().catch(error => {
            console.error('Failed to initialize ComputeTextureBatch:', error);
            this.initializationError = error;
            throw error;
        });
    }

    async init() {
        try {
            console.log('Starting ComputeTextureBatch initialization...');
            const [computeResult, renderResult] = await Promise.all([
                this.setupComputePipeline(),
                this.setupRenderPipeline(),
            ]);
            if (!computeResult || !renderResult) {
                throw new Error('Pipeline setup failed');
            }
            await this.setupResources();
            this.initialized = true;
            console.log('ComputeTextureBatch initialized successfully');
        } catch (error) {
            console.error('Error in ComputeTextureBatch.init:', error);
            this.initializationError = error;
            throw error;
        }
    }

    async setupComputePipeline(computeShaderCode = null) {
        try {
            this.currentComputeShaderCode = computeShaderCode || await fetch('js/shaders/custom_compute.wgsl').then(r => r.text());
            this.computeBindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba8unorm', access: 'write-only' } },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba8unorm', access: 'write-only' } },
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
                    { binding: 4, visibility: GPUShaderStage.COMPUTE, sampler: {} },
                    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                ],
                label: 'Compute Bind Group Layout',
            });

            this.computePipeline = await this.device.createComputePipelineAsync({
                layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.computeBindGroupLayout] }),
                compute: {
                    module: this.device.createShaderModule({ code: this.currentComputeShaderCode, label: 'Compute Shader Module' }),
                    entryPoint: 'main',
                },
                label: 'Compute Pipeline',
            });
            console.log('Compute pipeline created successfully');
            return true;
        } catch (error) {
            console.error('Error in setupComputePipeline:', error);
            throw error;
        }
    }

    async setComputeShader(computeShaderCode) {
        try {
            console.log('Updating compute shader...');
            this.currentComputeShaderCode = computeShaderCode;
            await this.setupComputePipeline(computeShaderCode);
            this.updateComputeBindGroup(this.objectTexture, this.shadowTexture, this.textures?.hero || this.inputTexture);
            console.log('Compute shader updated successfully');
        } catch (error) {
            console.error('Error in setComputeShader:', error);
            throw error;
        }
    }

    async setupRenderPipeline() {
        try {
            const vertexShaderCode = await fetch('js/shaders/texture_vertex.wgsl').then(r => r.text());
            const fragmentShaderCode = await fetch('js/shaders/texture_fragment.wgsl').then(r => r.text());

            this.renderBindGroupLayout = this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                    { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
                    { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                ],
                label: 'Render Bind Group Layout',
            });

            this.renderPipeline = await this.device.createRenderPipelineAsync({
                layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.renderBindGroupLayout] }),
                vertex: {
                    module: this.device.createShaderModule({ code: vertexShaderCode, label: 'Vertex Shader Module' }),
                    entryPoint: 'main',
                },
                fragment: {
                    module: this.device.createShaderModule({ code: fragmentShaderCode, label: 'Fragment Shader Module' }),
                    entryPoint: 'main',
                    targets: [{
                        format: this.webgpu.format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
                },
                primitive: { topology: 'triangle-strip', stripIndexFormat: 'uint32' },
                label: 'Render Pipeline',
            });

            this.sampler = this.device.createSampler({ magFilter: 'nearest', minFilter: 'nearest', label: 'Sampler' });
            console.log('Render pipeline created successfully');
            return true;
        } catch (error) {
            console.error('Error in setupRenderPipeline:', error);
            throw error;
        }
    }

    async setupResources() {
        try {
            console.log('Creating output textures...');
            this.objectTexture = this.device.createTexture({
                size: [this.textureWidth, this.textureHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
                label: 'Object Texture',
            });
            this.shadowTexture = this.device.createTexture({
                size: [this.textureWidth, this.textureHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
                label: 'Shadow Texture',
            });

            console.log('Textures provided:', this.textures);
            this.inputTexture = this.textures?.hero || this.device.createTexture({
                size: [112, 112],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
                label: 'Default Input Texture',
            });
            if (!this.textures?.hero) {
                const blankData = new Uint8Array(112 * 112 * 4).fill(255);
                this.device.queue.writeTexture(
                    { texture: this.inputTexture },
                    blankData,
                    { bytesPerRow: 112 * 4, rowsPerImage: 112 },
                    [112, 112]
                );
            }

            this.uniformBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Uniform Buffer',
            });

            this.spriteDataBuffer = this.device.createBuffer({
                size: this.maxInstances * 36,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'Sprite Data Buffer',
            });

            this.updateComputeBindGroup(this.objectTexture, this.shadowTexture, this.inputTexture);
            this.updateRenderBindGroup(this.objectTexture, this.shadowTexture);
        } catch (error) {
            console.error('Error in setupResources:', error);
            throw error;
        }
    }

    updateComputeBindGroup(objectTexture, shadowTexture, inputTexture) {
        console.log('Updating compute bind group:', {
            objectTexture: objectTexture.label || 'Unnamed Texture',
            shadowTexture: shadowTexture.label || 'Unnamed Texture',
            inputTexture: inputTexture.label || 'Unnamed Texture'
        });
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computeBindGroupLayout,
            entries: [
                { binding: 0, resource: objectTexture.createView() },
                { binding: 1, resource: shadowTexture.createView() },
                { binding: 2, resource: { buffer: this.uniformBuffer } },
                { binding: 3, resource: inputTexture.createView() },
                { binding: 4, resource: this.sampler },
                { binding: 5, resource: { buffer: this.spriteDataBuffer } },
            ],
            label: 'Compute Bind Group',
        });
    }

    updateRenderBindGroup(objectTexture, shadowTexture, mapTexture = null) {
        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderBindGroupLayout,
            entries: [
                { binding: 0, resource: objectTexture.createView() },
                { binding: 1, resource: shadowTexture.createView() },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: { buffer: this.spriteDataBuffer } },
                { binding: 4, resource: mapTexture ? mapTexture.createView() : this.objectTexture.createView() },
            ],
            label: 'Render Bind Group',
        });
    }

    updateTime(time) {
        if (!this.initialized || !this.uniformBuffer) {
            console.warn('ComputeTextureBatch not initialized or uniformBuffer missing', {
                initialized: this.initialized,
                uniformBuffer: this.uniformBuffer,
                initializationError: this.initializationError,
            });
            return;
        }
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([time / 1000, canvasWidth, canvasHeight, 0]));
    }

    updatePositions(positions) {
        if (!this.spriteDataBuffer) {
            console.warn('spriteDataBuffer missing in updatePositions');
            return 0;
        }
        if (positions.length > this.maxInstances) {
            console.warn(`Too many instances: ${positions.length} exceeds maxInstances ${this.maxInstances}`);
            positions = positions.slice(0, this.maxInstances);
        }
        const spriteData = new Float32Array(positions.length * 9);
        for (let i = 0; i < positions.length; i++) {
            const sprite = positions[i];
            spriteData[i * 9] = sprite.x;
            spriteData[i * 9 + 1] = sprite.y;
            spriteData[i * 9 + 2] = sprite.type;
            spriteData[i * 9 + 3] = sprite.xSize;
            spriteData[i * 9 + 4] = sprite.ySize;
            spriteData[i * 9 + 5] = sprite.baseY;
            spriteData[i * 9 + 6] = sprite.maxShadowDist;
            spriteData[i * 9 + 7] = sprite.rotation || 0;
            spriteData[i * 9 + 8] = sprite.tileIndex || 0;
        }
        this.device.queue.writeBuffer(this.spriteDataBuffer, 0, spriteData);
        return positions.length;
    }

    dispatch(computePass) {
        if (!this.initialized || !this.computePipeline || !this.computeBindGroup) {
            console.warn('ComputeTextureBatch not initialized or missing compute resources', {
                initialized: this.initialized,
                computePipeline: this.computePipeline,
                computeBindGroup: this.computeBindGroup,
                initializationError: this.initializationError,
            });
            return;
        }
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.computeBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(this.textureWidth / 8),
            Math.ceil(this.textureHeight / 8)
        );
    }

    draw(renderPass, positions, textures, mapTexture = null) {
        if (!this.initialized || !this.renderPipeline || !this.renderBindGroup) {
            console.warn('ComputeTextureBatch not initialized or missing render resources', {
                initialized: this.initialized,
                renderPipeline: this.renderPipeline,
                renderBindGroup: this.renderBindGroup,
                initializationError: this.initializationError,
            });
            return;
        }
        if (!positions || !Array.isArray(positions) || positions.length === 0) {
            console.warn('No valid positions provided to draw');
            return;
        }
        if (!textures || !textures.hero || !textures.tree) {
            console.warn('Invalid textures provided to draw:', textures);
            return;
        }

        const instanceCount = this.updatePositions(positions);
        if (instanceCount === 0) {
            console.warn('No instances to draw after updatePositions');
            return;
        }

        console.log('Drawing sprites:', positions.map(s => ({ type: s.type, x: s.x, y: s.y, tileIndex: s.tileIndex })));

        const commandEncoder = this.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        for (let i = 0; i < positions.length; i++) {
            const sprite = positions[i];
            const texture = sprite.type === 0 ? textures.hero : textures.tree;
            console.log('Binding texture for sprite:', { type: sprite.type, textureLabel: texture.label || 'Unnamed Texture' });
            this.updateComputeBindGroup(this.objectTexture, this.shadowTexture, texture);
            computePass.setPipeline(this.computePipeline);
            computePass.setBindGroup(0, this.computeBindGroup);
            computePass.dispatchWorkgroups(
                Math.min(Math.ceil(sprite.xSize / 8), 64),
                Math.min(Math.ceil(sprite.ySize / 8), 64),
                1
            );
        }
        computePass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        this.updateRenderBindGroup(this.objectTexture, this.shadowTexture, mapTexture);
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(4, instanceCount);
    }

    isInitialized() {
        return this.initialized;
    }
}