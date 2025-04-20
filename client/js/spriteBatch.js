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
        hasRotation = false, // Add hasRotation parameter
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
        this.hasRotation = hasRotation;

        // Create buffer for sprite data (positions, UVs)
        this.buffer = device.createBuffer({
            size: maxSprites * 6 * (hasRotation ? 7 : 4) * 4, // 7 floats: pos (2), uv (2), rotation (1), center (2)            
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Create a buffer for the uniform data (camera position, time, etc.)
        this.uniformBuffer = device.createBuffer({
            size: 64, // Adjust size depending on your uniform data
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create the pipeline (this should be done once per batch)
        this.pipeline = this._createPipeline(vertexShaderCode, fragmentShaderCode, uniformBindGroupLayout, hasRotation);

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

    _createPipeline(vertexCode, fragmentCode, uniformBindGroupLayout, hasRotation = false) {
        const shaderModuleVert = this.device.createShaderModule({ code: vertexCode });
        const shaderModuleFrag = this.device.createShaderModule({ code: fragmentCode });
    
        const textureBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });
    
        const finalUniformBindGroupLayout = uniformBindGroupLayout ??
            this.device.createBindGroupLayout({
                entries: [
                    { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                ]
            });
    
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [textureBindGroupLayout, finalUniformBindGroupLayout],
        });
    
        const vertexAttributes = [
            { shaderLocation: 0, offset: 0, format: 'float32x2' }, // Position
            { shaderLocation: 1, offset: 8, format: 'float32x2' }, // UV
        ];
        if (hasRotation) {
            vertexAttributes.push(
                { shaderLocation: 2, offset: 16, format: 'float32' }, // Rotation
                { shaderLocation: 3, offset: 20, format: 'float32x2' } // Center
            );        
        }
    
        return this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModuleVert,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: hasRotation ? 28 : 16, // 5 floats (20 bytes) or 4 floats (16 bytes)
                    attributes: vertexAttributes,
                }],
            },
            fragment: {
                module: shaderModuleFrag,
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
    
        const floatsPerVertex = this.hasRotation ? 7 : 4;
        const vertexData = new Float32Array(spriteData.length * 6 * floatsPerVertex);
        for (let i = 0; i < spriteData.length; i++) {
            const sprite = spriteData[i];
            const { x, y, tile, rotation = 0 } = sprite;
    
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
    
            // Compute sprite center in NDC
            const centerX = (2 * (x + this.spriteWidth / 2) / canvasWidth) - 1;
            const centerY = 1 - (2 * (y + this.spriteHeight / 2) / canvasHeight);
    
            const offset = i * 6 * floatsPerVertex;
            const vertexBase = [
                left, top, u0, v0,
                left, bottom, u0, v1,
                right, bottom, u1, v1,
                left, top, u0, v0,
                right, bottom, u1, v1,
                right, top, u1, v0,
            ];
            if (this.hasRotation) {
                vertexData.set([
                    ...vertexBase.slice(0, 4), rotation, centerX, centerY,
                    ...vertexBase.slice(4, 8), rotation, centerX, centerY,
                    ...vertexBase.slice(8, 12), rotation, centerX, centerY,
                    ...vertexBase.slice(12, 16), rotation, centerX, centerY,
                    ...vertexBase.slice(16, 20), rotation, centerX, centerY,
                    ...vertexBase.slice(20, 24), rotation, centerX, centerY,
                ], offset);
            } else {
                vertexData.set(vertexBase, offset);
            }
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
