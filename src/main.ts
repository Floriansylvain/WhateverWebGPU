import "./style.css"

const GRID_SIZE = 32

async function getCanvas(): Promise<HTMLCanvasElement> {
	const canvas = document.querySelector<HTMLCanvasElement>("#canvas")
	if (!canvas) throw new Error("Canvas element not found")
	return canvas
}

async function getAdapter(): Promise<GPUAdapter> {
	if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.")
	const adapter = await navigator.gpu.requestAdapter()
	if (!adapter) throw new Error("No appropriate GPUAdapter found.")
	return adapter
}

async function getDevice(adapter: GPUAdapter): Promise<GPUDevice> {
	return await adapter.requestDevice()
}

function configureContext(
	canvas: HTMLCanvasElement,
	device: GPUDevice,
): GPUCanvasContext {
	const context = canvas.getContext("webgpu")
	if (!context) throw new Error("Failed to get WebGPU context.")
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
	context.configure({ device, format: canvasFormat })
	return context
}

function createVertexBufferLayout(): GPUVertexBufferLayout {
	return {
		arrayStride: 8,
		attributes: [
			{ format: "float32x2" as GPUVertexFormat, offset: 0, shaderLocation: 0 },
		],
	}
}

async function createCellPipeline(
	device: GPUDevice,
	canvasFormat: GPUTextureFormat,
): Promise<GPURenderPipeline> {
	const cellShaderModule = device.createShaderModule({
		label: "Cell shader",
		code: (await import("./shaders/cell.wgsl?raw")).default,
	})

	return device.createRenderPipeline({
		label: "Cell pipeline",
		layout: "auto",
		vertex: {
			module: cellShaderModule,
			entryPoint: "vertexMain",
			buffers: [createVertexBufferLayout()],
		},
		fragment: {
			module: cellShaderModule,
			entryPoint: "fragmentMain",
			targets: [{ format: canvasFormat }],
		},
	})
}

function createGridUniformBuffer(device: GPUDevice): GPUBuffer {
	const gridUniformArray = new Float32Array([GRID_SIZE, GRID_SIZE])
	const gridUniformBuffer = device.createBuffer({
		label: "Grid Uniforms",
		size: gridUniformArray.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	})
	device.queue.writeBuffer(gridUniformBuffer, 0, gridUniformArray)
	return gridUniformBuffer
}

function createTimeBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		label: "Time Uniform",
		size: 4,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	})
}

function createBindGroup(
	device: GPUDevice,
	cellPipeline: GPURenderPipeline,
	gridUniformBuffer: GPUBuffer,
	timeBuffer: GPUBuffer,
): GPUBindGroup {
	return device.createBindGroup({
		label: "Cell renderer bind group",
		layout: cellPipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: gridUniformBuffer } },
			{ binding: 1, resource: { buffer: timeBuffer } },
		],
	})
}

function createVertexBuffer(device: GPUDevice): GPUBuffer {
	const vertices = new Float32Array([
		-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
	])
	const vertexBuffer = device.createBuffer({
		label: "Cell vertices",
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	})
	device.queue.writeBuffer(vertexBuffer, 0, vertices)
	return vertexBuffer
}

class Renderer {
	constructor(
		private device: GPUDevice,
		private context: GPUCanvasContext,
		private cellPipeline: GPURenderPipeline,
		private vertexBuffer: GPUBuffer,
		private bindGroup: GPUBindGroup,
		private timeBuffer: GPUBuffer,
		private vertices: Float32Array,
	) {}

	public render(timeMs: number): void {
		const time = timeMs / 1000
		this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([time]))

		const encoder = this.device.createCommandEncoder()
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: [0.0, 0.0, 0.4, 1.0],
					storeOp: "store",
				},
			],
		})

		pass.setPipeline(this.cellPipeline)
		pass.setVertexBuffer(0, this.vertexBuffer)
		pass.setBindGroup(0, this.bindGroup)
		pass.draw(this.vertices.length / 2, GRID_SIZE * GRID_SIZE)
		pass.end()

		this.device.queue.submit([encoder.finish()])
		requestAnimationFrame((time) => this.render(time))
	}
}

async function init() {
	const device = await getDevice(await getAdapter())
	const context = configureContext(await getCanvas(), device)
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat()

	const cellPipeline = await createCellPipeline(device, canvasFormat)
	const gridUniformBuffer = createGridUniformBuffer(device)
	const timeBuffer = createTimeBuffer(device)
	const bindGroup = createBindGroup(
		device,
		cellPipeline,
		gridUniformBuffer,
		timeBuffer,
	)
	const vertexBuffer = createVertexBuffer(device)
	const vertices = new Float32Array([
		-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
	])

	const renderer = new Renderer(
		device,
		context,
		cellPipeline,
		vertexBuffer,
		bindGroup,
		timeBuffer,
		vertices,
	)
	requestAnimationFrame((time) => renderer.render(time))
}

init().catch((error) => {
	console.error("Error initializing WebGPU:", error)
})
