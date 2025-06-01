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
        uniformBindGroupLayout,
        hasRotation = false,
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
        this.spriteData = []; // Store sprite data

        // Create buffer for sprite data
        this.buffer = device.createBuffer({
            size: maxSprites * 6 * (hasRotation ? 7 : 4) * 4,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        // Create uniform buffer
        this.uniformBuffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create pipeline
        this.pipeline = this._createPipeline(vertexShaderCode, fragmentShaderCode, uniformBindGroupLayout, hasRotation);

        // Create uniform bind group
        this.uniformBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                    },
                },
            ],
        });

        // Create texture bind group
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
                    arrayStride: hasRotation ? 28 : 16,
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

    setSpriteData(spriteData) {
        this.spriteData = spriteData; // Store sprite data for rendering
    }

    draw(renderPass) {
        if (!this.spriteData.length) return;
    
        const canvas = this.webgpu.getContext().canvas;
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
    
        const tilesPerRow = this.sheetWidth / this.spriteWidth;
        const uScale = this.spriteWidth / this.sheetWidth;
        const vScale = this.spriteHeight / this.sheetHeight;
        const xNDCScale = 2 / canvasWidth;
        const yNDCScale = 2 / canvasHeight;
        const halfSpriteWidth = this.spriteWidth / 2;
        const halfSpriteHeight = this.spriteHeight / 2;
        const floatsPerVertex = this.hasRotation ? 7 : 4;
    
        const vertexData = new Float32Array(this.spriteData.length * 6 * floatsPerVertex);
        for (let i = 0; i < this.spriteData.length; i++) {
            const sprite = this.spriteData[i];
            const { x, y, tile, rotation = 0 } = sprite;
    
            const spriteX = (tile % tilesPerRow) * this.spriteWidth;
            const spriteY = Math.floor(tile / tilesPerRow) * this.spriteHeight;
    
            const u0 = spriteX / this.sheetWidth;
            const v0 = spriteY / this.sheetHeight;
            const u1 = u0 + uScale;
            const v1 = v0 + vScale;
    
            const left = (x * xNDCScale) - 1;
            const right = ((x + this.spriteWidth) * xNDCScale) - 1;
            const top = 1 - (y * yNDCScale);
            const bottom = 1 - ((y + this.spriteHeight) * yNDCScale);
    
            const centerX = ((x + halfSpriteWidth) * xNDCScale) - 1;
            const centerY = 1 - ((y + halfSpriteHeight) * yNDCScale);
    
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
        renderPass.draw(this.spriteData.length * 6, 1, 0, 0);
    }

    clear() {
        this.spriteData = []; // Clear sprite data
    }
}