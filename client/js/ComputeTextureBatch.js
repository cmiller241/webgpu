export class ComputeTextureBatch {
    constructor(device, webgpu, textureWidth, textureHeight) {
        this.device = device;
        this.webgpu = webgpu;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
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
                throw new Error(`Failed to load texture_vertex.wgsl: ${vertexResponse.status} ${vertexResponse.statusText}`);
            }
            const vertexShaderCode = await vertexResponse.text();

            console.log('Loading texture_fragment.wgsl...');
            const fragmentResponse = await fetch('js/shaders/texture_fragment.wgsl');
            if (!fragmentResponse.ok) {
                throw new Error(`Failed to load texture_fragment.wgsl: ${fragmentResponse.status} ${fragmentResponse.statusText}`);
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
                        buffer: { type: 'uniform' },
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
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Render Uniform Buffer',
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
                ],
                label: 'Render Bind Group',
            });

            console.log('Updating render uniforms...');
            this.updateRenderUniforms(256, 256, 50, 50);
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

    updateRenderUniforms(width, height, x, y) {
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
            x / canvasWidth * 2 - 1,
            y / canvasHeight * 2 - 1,
        ]);
        console.log('Updating render uniforms:', { width, height, x, y, size });
        this.device.queue.writeBuffer(this.renderUniformBuffer, 0, size);
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

    draw(renderPass) {
        if (!this.initialized || !this.renderPipeline || !this.renderBindGroup) {
            console.warn('ComputeTextureBatch not initialized or missing render resources in draw', {
                initialized: this.initialized,
                renderPipeline: this.renderPipeline,
                renderBindGroup: this.renderBindGroup,
                initializationError: this.initializationError,
            });
            return;
        }
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(4);
    }

    isInitialized() {
        return this.initialized;
    }
}