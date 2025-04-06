import "./style.css"

const GRID_SIZE = 64
let COMPUTE_MS_INTERVAL = 100

function setupSliders() {
	const computeIntervalSlider = document.getElementById(
		"compute-interval-slider",
	) as HTMLInputElement
	const computeIntervalValue = document.getElementById(
		"compute-interval-value",
	) as HTMLElement

	computeIntervalSlider.addEventListener("input", () => {
		COMPUTE_MS_INTERVAL = parseInt(computeIntervalSlider.value)
		computeIntervalValue.textContent = computeIntervalSlider.value
	})
}

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

function createPipelineLayout(
	device: GPUDevice,
	bindGroupLayout: GPUBindGroupLayout,
): GPUPipelineLayout {
	return device.createPipelineLayout({
		label: "Cell Pipeline Layout",
		bindGroupLayouts: [bindGroupLayout],
	})
}

async function createComputePipeline(
	device: GPUDevice,
	pipelineLayout: GPUPipelineLayout,
): Promise<GPUComputePipeline> {
	return device.createComputePipeline({
		label: "Simulation pipeline",
		layout: pipelineLayout,
		compute: {
			module: device.createShaderModule({
				label: "Game of Life simulation shader",
				code: (await import("./shaders/simulation.wgsl?raw")).default,
			}),
			entryPoint: "computeMain",
		},
	})
}

async function createCellPipeline(
	device: GPUDevice,
	canvasFormat: GPUTextureFormat,
	pipelineLayout: GPUPipelineLayout,
): Promise<GPURenderPipeline> {
	const cellShaderModule = device.createShaderModule({
		label: "Cell shader",
		code: (await import("./shaders/cell.wgsl?raw")).default,
	})

	return device.createRenderPipeline({
		label: "Cell pipeline",
		layout: pipelineLayout,
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

function createTimeUniformBuffer(device: GPUDevice): GPUBuffer {
	return device.createBuffer({
		label: "Time Uniform",
		size: 4,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	})
}

function createStateStorageBuffers(device: GPUDevice): GPUBuffer[] {
	const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE)
	const size = cellStateArray.byteLength
	const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
	const cellStateStorage = [
		device.createBuffer({ label: "Cell State A", size, usage }),
		device.createBuffer({ label: "Cell State B", size, usage }),
	]
	for (let i = 0; i < cellStateArray.length; ++i) {
		cellStateArray[i] = Math.random() > 0.6 ? 1 : 0
	}
	device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray)
	return cellStateStorage
}

function createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
	return device.createBindGroupLayout({
		label: "Cell Bind Group Layout",
		entries: [
			{
				binding: 0,
				visibility:
					GPUShaderStage.FRAGMENT |
					GPUShaderStage.VERTEX |
					GPUShaderStage.COMPUTE,
				buffer: { type: "uniform" },
			},
			{
				binding: 1,
				visibility: GPUShaderStage.FRAGMENT,
				buffer: { type: "uniform" },
			},
			{
				binding: 2,
				visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
				buffer: { type: "read-only-storage" },
			},
			{
				binding: 3,
				visibility: GPUShaderStage.COMPUTE,
				buffer: { type: "storage" },
			},
		],
	})
}

function createBindGroups(
	device: GPUDevice,
	gridUniformBuffer: GPUBuffer,
	timeUniformBuffer: GPUBuffer,
	cellStateStorage: GPUBuffer[],
	bindGroupLayout: GPUBindGroupLayout,
): GPUBindGroup[] {
	return [
		device.createBindGroup({
			label: "Cell renderer bind group A",
			layout: bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: gridUniformBuffer } },
				{ binding: 1, resource: { buffer: timeUniformBuffer } },
				{ binding: 2, resource: { buffer: cellStateStorage[0] } },
				{ binding: 3, resource: { buffer: cellStateStorage[1] } },
			],
		}),
		device.createBindGroup({
			label: "Cell updater bind group B",
			layout: bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: gridUniformBuffer } },
				{ binding: 1, resource: { buffer: timeUniformBuffer } },
				{ binding: 2, resource: { buffer: cellStateStorage[1] } },
				{ binding: 3, resource: { buffer: cellStateStorage[0] } },
			],
		}),
	]
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
	private lastFrameTime: number = 0
	private frameCount: number = 0
	private fps: number = 0
	private bindGroupIndex: number = 0
	private lastBindGroupSwitchTime: number = 0

	constructor(
		private device: GPUDevice,
		private context: GPUCanvasContext,
		private cellPipeline: GPURenderPipeline,
		private simulationPipeline: GPUComputePipeline,
		private vertexBuffer: GPUBuffer,
		private bindGroups: GPUBindGroup[],
		private timeBuffer: GPUBuffer,
		private vertices: Float32Array,
	) {}

	private updateFpsCount(timeMs: number): void {
		if (this.lastFrameTime === 0) this.lastFrameTime = timeMs
		this.frameCount++
		if (timeMs - this.lastFrameTime >= 1000) {
			this.fps = this.frameCount
			this.frameCount = 0
			this.lastFrameTime = timeMs
			document.querySelector("#fps")!.textContent = `FPS: ${this.fps}`
		}
	}

	private updateBindGroupIndex(timeMs: number): void {
		if (timeMs - this.lastBindGroupSwitchTime >= COMPUTE_MS_INTERVAL) {
			this.bindGroupIndex = (this.bindGroupIndex + 1) % this.bindGroups.length
			this.lastBindGroupSwitchTime = timeMs
		}
	}

	public async render(timeMs: number): Promise<void> {
		const encoder = this.device.createCommandEncoder()

		const computePass = encoder.beginComputePass()
		computePass.setPipeline(this.simulationPipeline)
		computePass.setBindGroup(0, this.bindGroups[this.bindGroupIndex])

		const workgroupCount = Math.ceil(GRID_SIZE / 8)
		computePass.dispatchWorkgroups(workgroupCount, workgroupCount)

		computePass.end()

		const time = timeMs / 1000
		this.updateFpsCount(timeMs)
		this.device.queue.writeBuffer(this.timeBuffer, 0, new Float32Array([time]))
		this.updateBindGroupIndex(timeMs)

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

		pass.setBindGroup(0, this.bindGroups[this.bindGroupIndex])

		pass.draw(this.vertices.length / 2, GRID_SIZE * GRID_SIZE)
		pass.end()

		this.device.queue.submit([encoder.finish()])
		requestAnimationFrame((time) => this.render(time))
	}
}

async function init() {
	setupSliders()

	const device = await getDevice(await getAdapter())
	const context = configureContext(await getCanvas(), device)
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat()

	const gridUniformBuffer = createGridUniformBuffer(device)
	const timeBuffer = createTimeUniformBuffer(device)
	const cellStateStorage = createStateStorageBuffers(device)
	const bindGroupLayout = createBindGroupLayout(device)
	const bindGroups = createBindGroups(
		device,
		gridUniformBuffer,
		timeBuffer,
		cellStateStorage,
		bindGroupLayout,
	)
	const pipelineLayout = createPipelineLayout(device, bindGroupLayout)
	const cellPipeline = await createCellPipeline(
		device,
		canvasFormat,
		pipelineLayout,
	)
	const simulationPipeline = await createComputePipeline(device, pipelineLayout)
	const vertexBuffer = createVertexBuffer(device)
	const vertices = new Float32Array([
		-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
	])

	const renderer = new Renderer(
		device,
		context,
		cellPipeline,
		simulationPipeline,
		vertexBuffer,
		bindGroups,
		timeBuffer,
		vertices,
	)
	requestAnimationFrame((time) => renderer.render(time))
}

init().catch((error) => {
	console.error("Error initializing WebGPU:", error)
})
