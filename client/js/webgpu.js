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

        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        // Create uniform buffer (only pos now: 2 floats = 8 bytes)
        this.uniformBuffer = this.device.createBuffer({
            size: 8, // 2 floats (pos.x, pos.y)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create uniform bind group
        const uniformBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.uniformBindGroup = this.device.createBindGroup({
            layout: uniformBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.uniformBuffer }
                }
            ]
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

    getDevice() {
        return this.device;
    }

    getContext() {
        return this.context;
    }

    getUniformBindGroup() {
        return this.uniformBindGroup;
    }

    updateTime() {
        this.updateUniforms(); // Still updates pos, though it’s static here
    }
}