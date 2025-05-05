export class ComputeTextureBatch {
    constructor(device, webgpu, textureWidth, textureHeight, maxInstances = 1000, texture = null) {
        this.device = device;
        this.webgpu = webgpu;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
        this.maxInstances = maxInstances;
        this.initialized = false;
        this.initializationError = null;
        this.providedTexture = texture; // Store provided texture (optional input texture)
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
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: {
                            format: 'rgba8unorm',
                            access: 'write-only',
                        },
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'uniform' },
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: { sampleType: 'float' }, // Input texture for reading
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        sampler: {}, // Sampler for input texture
                    },
                ],
                label: 'Compute Bind Group Layout',
            });

            this.computePipeline = await this.device.createComputePipelineAsync({
                layout: this.device.createPipelineLayout({
                    bindGroupLayouts: [this.computeBindGroupLayout],
                }),
                compute: {
                    module: this.device.createShaderModule({ 
                        code: this.currentComputeShaderCode,
                        label: 'Compute Shader Module'
                    }),
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
            // Recreate compute bind group to match new pipeline
            this.updateComputeBindGroup(this.texture, this.inputTexture);
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
                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: { sampleType: 'float' },
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {},
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: 'read-only-storage' },
                    },
                ],
                label: 'Render Bind Group Layout',
            });

            this.renderPipeline = await this.device.createRenderPipelineAsync({
                layout: this.device.createPipelineLayout({
                    bindGroupLayouts: [this.renderBindGroupLayout],
                }),
                vertex: {
                    module: this.device.createShaderModule({ 
                        code: vertexShaderCode,
                        label: 'Vertex Shader Module'
                    }),
                    entryPoint: 'main',
                },
                fragment: {
                    module: this.device.createShaderModule({ 
                        code: fragmentShaderCode,
                        label: 'Fragment Shader Module'
                    }),
                    entryPoint: 'main',
                    targets: [{
                        format: this.webgpu.format,
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                        },
                    }],
                },
                primitive: {
                    topology: 'triangle-strip',
                    stripIndexFormat: 'uint32',
                },
                label: 'Render Pipeline',
            });

            this.sampler = this.device.createSampler({
                magFilter: 'nearest',
                minFilter: 'nearest',
                label: 'Sampler',
            });
            return true;
        } catch (error) {
            console.error('Error in setupRenderPipeline:', error);
            throw error;
        }
    }

    async setupResources() {
        try {
            // Create output texture (for compute shader to write to)
            console.log('Creating compute output texture...');
            this.texture = this.device.createTexture({
                size: [this.textureWidth, this.textureHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
                label: 'Compute Output Texture',
            });

            // Use provided texture if available, otherwise create a default input texture
            console.log('Provided texture:', this.providedTexture);
            if (this.providedTexture) {
                this.inputTexture = this.providedTexture;
                console.log('Using provided texture as input texture', {
                    width: this.inputTexture.width,
                    height: this.inputTexture.height
                });
            } else {
                console.log('Creating default input texture...');
                this.inputTexture = this.device.createTexture({
                    size: [this.textureWidth, this.textureHeight],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
                    label: 'Default Input Texture',
                });
                // Initialize with a blank texture (white)
                const blankData = new Uint8Array(this.textureWidth * this.textureHeight * 4).fill(255); // White texture
                this.device.queue.writeTexture(
                    { texture: this.inputTexture }, // destination
                    blankData, // source
                    { bytesPerRow: this.textureWidth * 4, rowsPerImage: this.textureHeight }, // dataLayout
                    [this.textureWidth, this.textureHeight] // size
                );
            }

            this.timeBuffer = this.device.createBuffer({
                size: 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Time Uniform Buffer',
            });

            this.positionBuffer = this.device.createBuffer({
                size: this.maxInstances * 16,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'Position Storage Buffer',
            });

            this.updateComputeBindGroup(this.texture, this.inputTexture);
            this.updateRenderBindGroup(this.texture);
        } catch (error) {
            console.error('Error in setupResources:', error);
            throw error;
        }
    }

    updateComputeBindGroup(outputTexture, inputTexture) {
        console.log('Updating compute bind group:', {
            outputTexture: outputTexture.label,
            inputTexture: inputTexture.label
        });
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computeBindGroupLayout,
            entries: [
                { binding: 0, resource: outputTexture.createView() }, // Output storage texture
                { binding: 1, resource: { buffer: this.timeBuffer } }, // Time uniform
                { binding: 2, resource: inputTexture.createView() }, // Input texture
                { binding: 3, resource: this.sampler }, // Sampler for input texture
            ],
            label: 'Compute Bind Group',
        });
    }

    updateRenderBindGroup(texture) {
        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderBindGroupLayout,
            entries: [
                { binding: 0, resource: texture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 3, resource: { buffer: this.positionBuffer } },
            ],
            label: 'Render Bind Group',
        });
    }

    updateTime(time) {
        if (!this.initialized || !this.timeBuffer) {
            console.warn('ComputeTextureBatch not initialized or timeBuffer missing', {
                initialized: this.initialized,
                timeBuffer: this.timeBuffer,
                initializationError: this.initializationError,
            });
            return;
        }
        this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([time / 1000]));
    }

    updatePositions(positions) {
        if (!this.positionBuffer) {
            console.warn('positionBuffer missing in updatePositions');
            return 0;
        }
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        if (canvasWidth === 0 || canvasHeight === 0) {
            console.warn('Canvas has zero width or height in updatePositions');
            return 0;
        }
        if (positions.length > this.maxInstances) {
            console.warn(`Too many instances: ${positions.length} exceeds maxInstances ${this.maxInstances}`);
            positions = positions.slice(0, this.maxInstances);
        }
        const positionData = new Float32Array(positions.length * 4);
        for (let i = 0; i < positions.length; i++) {
            const centerX = positions[i].x + positions[i].xSize / 2;
            const centerY = positions[i].y + positions[i].ySize / 2;
            positionData[i * 4] = (centerX / canvasWidth) * 2 - 1;
            positionData[i * 4 + 1] = 1 - (centerY / canvasHeight) * 2;
            positionData[i * 4 + 2] = positions[i].xSize / canvasWidth * 2;
            positionData[i * 4 + 3] = positions[i].ySize / canvasHeight * 2;
        }
        this.device.queue.writeBuffer(this.positionBuffer, 0, positionData);
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

    draw(renderPass, positions, texture = null) {
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

        // Use output texture (compute result) for rendering
        const drawTexture = this.texture; // Always render the compute output
        if (!drawTexture) {
            console.warn('No valid texture provided for draw');
            return;
        }

        const instanceCount = this.updatePositions(positions);
        if (instanceCount === 0) {
            console.warn('No instances to draw after updatePositions');
            return;
        }

        this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([performance.now() / 1000]));
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(4, instanceCount);
    }

    isInitialized() {
        return this.initialized;
    }
}