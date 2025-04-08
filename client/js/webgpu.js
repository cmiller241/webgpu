/**
 * webgpu.js
 * 
 * A utility class to initialize and manage WebGPU context, canvas resizing,
 * shader loading, pipeline creation, and uniform buffer management.
 * 
 * Usage:
 *   const gpu = new WebGPUSetup('canvas-id', 2); // Optional scale factor
 *   await gpu.initialize();
 *   await gpu.createPipeline('vertex.wgsl', 'fragment.wgsl');
 * 
 * Responsibilities:
 * - Sets up WebGPU device, context, and canvas rendering surface
 * - Loads external vertex and fragment shaders
 * - Creates render pipeline with UV and position inputs
 * - Manages uniform buffer (default: vec2 position)
 * - Supports scale factor for performance tuning
 * 
 * Exposed Methods:
 * - initialize()
 * - resizeCanvas()
 * - setScaleFactor(newScaleFactor)
 * - loadShader(url)
 * - createPipeline(vertexUrl, fragmentUrl)
 * - getDevice(), getContext(), getPipeline(), getBindGroupLayout(), getUniformBindGroup()
 * 
 * Optional:
 * - Extend updateUniforms() to include time, resolution, etc.
 * - Add draw/render methods or texture handling if needed
 */

export class WebGPUSetup {
    constructor(canvasId, scaleFactor=1) {
        this.canvas = document.getElementById(canvasId);
        this.context = this.canvas.getContext('webgpu');
        if (!this.context) throw new Error('WebGPU not supported');
        this.scaleFactor = scaleFactor;  // Store the scale factor
        this.startTime = performance.now() / 1000; // For time uniform (optional, not used now)
    }

    async initialize() {
        this.adapter = await navigator.gpu.requestAdapter();
        this.device = await this.adapter.requestDevice();
        this.context.configure({
            device: this.device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: 'premultiplied',
        });

        // Create uniform buffer (only pos now: 2 floats = 8 bytes)
        this.uniformBuffer = this.device.createBuffer({
            size: 8, // 2 floats (pos.x, pos.y)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.resizeCanvas();
        this.updateUniforms();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth / this.scaleFactor;
        this.canvas.height = window.innerHeight / this.scaleFactor;

        this.canvas.style.width = `${window.innerWidth}px`;
        this.canvas.style.height = `${window.innerHeight}px`;

        this.updateUniforms();
    }

    setScaleFactor(newScaleFactor) {
        this.scaleFactor = newScaleFactor;
        this.resizeCanvas();  // Apply new scale immediately
    }

    updateUniforms() {
        const uniformData = new Float32Array([
            0.0, 0.0, // pos (default, can be updated if needed)
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    }

    async loadShader(url) {
        const response = await fetch(url);
        return await response.text();
    }

    async createPipeline(vertexUrl, fragmentUrl) {
        const vertexShaderCode = await this.loadShader(vertexUrl);
        const fragmentShaderCode = await this.loadShader(fragmentUrl);

        const vertexModule = this.device.createShaderModule({ code: vertexShaderCode });
        const fragmentModule = this.device.createShaderModule({ code: fragmentShaderCode });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });

        this.uniformBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }, // Only vertex stage needs it now
            ],
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout, this.uniformBindGroupLayout],
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: vertexModule,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 16,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // Position
                        { shaderLocation: 1, offset: 8, format: 'float32x2' }, // UV
                    ],
                }],
            },
            fragment: {
                module: fragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat(), 
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, // 🔥 FIXED
                    },
                }],
            },
            primitive: { topology: 'triangle-list' },
        });
        

        this.uniformBindGroup = this.device.createBindGroup({
            layout: this.uniformBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
        });
    }

    getDevice() {
        return this.device;
    }

    getContext() {
        return this.context;
    }

    getPipeline() {
        return this.pipeline;
    }

    getBindGroupLayout() {
        return this.bindGroupLayout;
    }

    getUniformBindGroup() {
        return this.uniformBindGroup;
    }

    updateTime() {
        this.updateUniforms(); // Still updates pos, though it’s static here
    }
}