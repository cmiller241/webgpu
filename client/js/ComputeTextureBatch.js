export class ComputeTextureBatch {
    constructor(device, webgpu, textureWidth, textureHeight, maxInstances = 100) {
        this.device = device;
        this.webgpu = webgpu;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
        this.maxInstances = maxInstances; // Maximum number of quads
        this.initialized = false;
        this.initializationError = null;

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
                throw new Error('Pipeline setup failed: compute or render pipeline returned falsy value');
            }
            console.log('Both pipelines set up successfully');
            await this.setupResources();
            this.initialized = true;
            console.log('ComputeTextureBatch initialized successfully');
        } catch (error) {
            console.error('Error in ComputeTextureBatch.init:', error);
            this.initializationError = error;
            throw error;
        }
    }

    async setupComputePipeline() {
        try {
            console.log('Loading compute.wgsl...');
            const response = await fetch('js/shaders/compute.wgsl');
            if (!response.ok) {
                throw new Error(`Failed to load compute.wgsl: ${response.status} ${response.statusText}`);
            }
            const computeShaderCode = await response.text();

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
                ],
                label: 'Compute Bind Group Layout',
            });

            this.computePipeline = await this.device.createComputePipelineAsync({
                layout: this.device.createPipelineLayout({
                    bindGroupLayouts: [this.computeBindGroupLayout],
                }),
                compute: {
                    module: this.device.createShaderModule({ 
                        code: computeShaderCode,
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

    async setupRenderPipeline() {
        try {
            console.log('Loading texture_vertex.wgsl...');
            const vertexResponse = await fetch('js/shaders/texture_vertex.wgsl');
            if (!vertexResponse.ok) {
                throw new Error(`Failed to load texture_vertex.wgsl: ${vertexResponse.status} ${response.statusText}`);
            }
            const vertexShaderCode = await vertexResponse.text();

            console.log('Loading texture_fragment.wgsl...');
            const fragmentResponse = await fetch('js/shaders/texture_fragment.wgsl');
            if (!fragmentResponse.ok) {
                throw new Error(`Failed to load texture_fragment.wgsl: ${fragmentResponse.status} ${response.statusText}`);
            }
            const fragmentShaderCode = await fragmentResponse.text();

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
                        binding: 2,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: 'uniform' }, // For size
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: 'read-only-storage' }, // For positions
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
                    targets: [{ format: this.webgpu.format }],
                },
                primitive: {
                    topology: 'triangle-strip',
                    stripIndexFormat: 'uint32',
                },
                label: 'Render Pipeline',
            });
            console.log('Render pipeline created successfully');

            this.sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
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
            console.log('Creating compute texture...');
            this.texture = this.device.createTexture({
                size: [this.textureWidth, this.textureHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
                label: 'Compute Texture',
            });

            console.log('Creating time buffer...');
            this.timeBuffer = this.device.createBuffer({
                size: 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Time Uniform Buffer',
            });

            console.log('Creating render uniform buffer...');
            this.renderUniformBuffer = this.device.createBuffer({
                size: 8, // vec2f for size only (2 * 4 bytes)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Render Uniform Buffer',
            });

            console.log('Creating position storage buffer...');
            this.positionBuffer = this.device.createBuffer({
                size: this.maxInstances * 8, // vec2f per instance (2 * 4 bytes)
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'Position Storage Buffer',
            });

            console.log('Creating compute bind group...');
            this.computeBindGroup = this.device.createBindGroup({
                layout: this.computeBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.texture.createView() },
                    { binding: 1, resource: { buffer: this.timeBuffer } },
                ],
                label: 'Compute Bind Group',
            });

            console.log('Creating render bind group...');
            this.renderBindGroup = this.device.createBindGroup({
                layout: this.renderBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.texture.createView() },
                    { binding: 1, resource: this.sampler },
                    { binding: 2, resource: { buffer: this.renderUniformBuffer } },
                    { binding: 3, resource: { buffer: this.positionBuffer } },
                ],
                label: 'Render Bind Group',
            });

            console.log('Updating render uniforms...');
            this.updateRenderUniforms(256, 256); // Set size only
            console.log('setupResources completed successfully');
        } catch (error) {
            console.error('Error in setupResources:', error);
            throw error;
        }
    }

    updateTime(time) {
        if (!this.initialized || !this.timeBuffer) {
            console.warn('ComputeTextureBatch not initialized or timeBuffer missing in updateTime', {
                initialized: this.initialized,
                timeBuffer: this.timeBuffer,
                initializationError: this.initializationError,
            });
            return;
        }
        this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([time / 1000]));
    }

    updateRenderUniforms(width, height) {
        if (!this.renderUniformBuffer) {
            console.warn('renderUniformBuffer missing in updateRenderUniforms', {
                initialized: this.initialized,
                renderUniformBuffer: this.renderUniformBuffer,
            });
            return;
        }
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        if (canvasWidth === 0 || canvasHeight === 0) {
            console.warn('Canvas has zero width or height in updateRenderUniforms');
            return;
        }
        const size = new Float32Array([
            width / canvasWidth * 2,
            height / canvasHeight * 2,
        ]);
        console.log('Updating render uniforms:', { width, height, size });
        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, size);
    }

    updatePositions(positions) {
        if (!this.positionBuffer) {
            console.warn('positionBuffer missing in updatePositions');
            return;
        }
        const canvasWidth = this.webgpu.getContext().canvas.width;
        const canvasHeight = this.webgpu.getContext().canvas.height;
        if (canvasWidth === 0 || canvasHeight === 0) {
            console.warn('Canvas has zero width or height in updatePositions');
            return;
        }
        console.log('Canvas size:', canvasWidth, canvasHeight); // Debug canvas size
        if (positions.length > this.maxInstances) {
            console.warn(`Too many instances: ${positions.length} exceeds maxInstances ${this.maxInstances}`);
            positions = positions.slice(0, this.maxInstances);
        }
        const textureHeight = 256; // Fixed texture height in pixels
        const positionData = new Float32Array(positions.length * 2);
        for (let i = 0; i < positions.length; i++) {
            // Convert x from [0, canvasWidth] to [-1, +1] (left edge)
            positionData[i * 2] = (positions[i].x / canvasWidth) * 2 - 1;
            // Convert y from top edge to NDC, adjusting for quad center
            const centerY = positions[i].y + textureHeight / 2; // Quad center in pixel space
            positionData[i * 2 + 1] = 1 - (centerY / canvasHeight) * 2; // Map to [+1, -1]
            console.log('Position', i, 'x:', positions[i].x, 'y:', positions[i].y, 'centerY:', centerY, 'NDC:', positionData[i * 2], positionData[i * 2 + 1]);
        }
        console.log('Updating positions:', positions, positionData);
        this.device.queue.writeBuffer(this.positionBuffer, 0, positionData);
        return positions.length; // Return instance count
    }

    dispatch(computePass) {
        if (!this.initialized || !this.computePipeline || !this.computeBindGroup) {
            console.warn('ComputeTextureBatch not initialized or missing compute resources in dispatch', {
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

    draw(renderPass, positions) {
        if (!this.initialized || !this.renderPipeline || !this.renderBindGroup) {
            console.warn('ComputeTextureBatch not initialized or missing render resources in draw', {
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
        const instanceCount = this.updatePositions(positions);
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(4, instanceCount); // 4 vertices, multiple instances
    }

    isInitialized() {
        return this.initialized;
    }
}