export class SpriteBatch {
    constructor(device, webgpu, {
        spriteWidth,
        spriteHeight,
        sheetWidth,
        sheetHeight,
        maxSprites,
        vertexShaderCode,
        fragmentShaderCode,
        textureData,
        uniformBindGroupLayout, // Accept bind group layout instead of the bind group
    }) {
        this.device = device;
        this.webgpu = webgpu;
        this.spriteWidth = spriteWidth;
        this.spriteHeight = spriteHeight;
        this.sheetWidth = sheetWidth;
        this.sheetHeight = sheetHeight;
        this.maxSprites = maxSprites;
        this.texture = textureData.texture;
        this.sampler = textureData.sampler;

        // Create buffer for sprite data (positions, UVs)
        this.buffer = device.createBuffer({
            size: maxSprites * 6 * 4 * 4, // 6 vertices per sprite, 4 floats per vertex, 4 bytes per float
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Create a buffer for the uniform data (camera position, time, etc.)
        this.uniformBuffer = device.createBuffer({
            size: 64, // Adjust size depending on your uniform data
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create the pipeline (this should be done once per batch)
        this.pipeline = this._createPipeline(vertexShaderCode, fragmentShaderCode, uniformBindGroupLayout);

        // Create the uniform bind group after the pipeline is created
        this.uniformBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1), // Use the layout from the pipeline
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer, // Binding uniform buffer
                    },
                },
            ],
        });

        // Create the bind group for texture and sampler
        this.bindGroup = this._createBindGroup();
    }

    _createPipeline(vertexCode, fragmentCode, uniformBindGroupLayout) {
        const shaderModuleVert = this.device.createShaderModule({ code: vertexCode });
        const shaderModuleFrag = this.device.createShaderModule({ code: fragmentCode });

        // Create explicit bind group layouts
        const textureBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });

        // Use the *uniform bind group layout* from the bind group you passed in
        const finalUniformBindGroupLayout = uniformBindGroupLayout ??
            this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                ]
            });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [textureBindGroupLayout, finalUniformBindGroupLayout],
        });

        return this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModuleVert,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32x2' },
                    ],
                }],
            },
            fragment: {
                module: shaderModuleFrag,
                entryPoint: 'main',
                targets: [{
                    format: this.webgpu.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',   // Source alpha factor
                            dstFactor: 'one-minus-src-alpha',  // Destination alpha factor
                            operation: 'add',  // Combine source and destination using "add"
                        },
                        alpha: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        }
                    }
                }],
            },
            primitive: { topology: 'triangle-list' },
        });
        
    }

    _createBindGroup() {
        const layout = this.pipeline.getBindGroupLayout(0);
        return this.device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: this.texture.createView() },
                { binding: 1, resource: this.sampler },
            ],
        });
    }

    draw(renderPass, spriteData) {
        if (!spriteData.length) return;

        const canvas = this.webgpu.getContext().canvas;
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        const vertexData = new Float32Array(spriteData.length * 6 * 4);
        for (let i = 0; i < spriteData.length; i++) {
            const { x, y, tile } = spriteData[i];

            const tilesPerRow = this.sheetWidth / this.spriteWidth;
            const spriteX = (tile % tilesPerRow) * this.spriteWidth;
            const spriteY = Math.floor(tile / tilesPerRow) * this.spriteHeight;

            const u0 = spriteX / this.sheetWidth;
            const v0 = spriteY / this.sheetHeight;
            const u1 = u0 + this.spriteWidth / this.sheetWidth;
            const v1 = v0 + this.spriteHeight / this.sheetHeight;

            const left = (2 * x / canvasWidth) - 1;
            const right = (2 * (x + this.spriteWidth) / canvasWidth) - 1;
            const top = 1 - (2 * y / canvasHeight);
            const bottom = 1 - (2 * (y + this.spriteHeight) / canvasHeight);

            const offset = i * 24;
            vertexData.set([
                left, top, u0, v0,
                left, bottom, u0, v1,
                right, bottom, u1, v1,
                left, top, u0, v0,
                right, bottom, u1, v1,
                right, top, u1, v0,
            ], offset);
        }

        this.device.queue.writeBuffer(this.buffer, 0, vertexData);

        renderPass.setPipeline(this.pipeline);
        renderPass.setVertexBuffer(0, this.buffer);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.setBindGroup(1, this.uniformBindGroup);
        renderPass.draw(spriteData.length * 6, 1, 0, 0);
    }

    clear() {
        // External code manages spriteData, nothing to clear here
    }
}
