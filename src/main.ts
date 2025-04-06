import "./style.css"

let GRID_SIZE = 64
let COMPUTE_MS_INTERVAL = 100

class UIController {
	static onReset(callback: () => void) {
		document.getElementById("reset-button")?.addEventListener("click", callback)
	}

	static setup() {
		const slider = document.getElementById(
			"compute-interval-slider",
		) as HTMLInputElement
		const valueLabel = document.getElementById(
			"compute-interval-value",
		) as HTMLElement

		slider.addEventListener("input", () => {
			COMPUTE_MS_INTERVAL = parseInt(slider.value)
			valueLabel.textContent = slider.value
		})
	}

	static onGridSizeChange(callback: (size: number) => void) {
		const slider = document.getElementById(
			"grid-size-slider",
		) as HTMLInputElement
		const valueLabel = document.getElementById("grid-size-value") as HTMLElement

		let timeout: ReturnType<typeof setTimeout>
		slider.addEventListener("input", () => {
			clearTimeout(timeout)
			const size = parseInt(slider.value)
			valueLabel.textContent = slider.value
			timeout = setTimeout(() => callback(size), 150)
		})
	}
}

async function getCanvas(): Promise<HTMLCanvasElement> {
	const canvas = document.querySelector<HTMLCanvasElement>("#canvas")
	if (!canvas) throw new Error("Canvas element not found")
	return canvas
}

async function getDevice(): Promise<GPUDevice> {
	if (!navigator.gpu) throw new Error("WebGPU not supported")
	const adapter = await navigator.gpu.requestAdapter()
	if (!adapter) throw new Error("No GPUAdapter found")
	return adapter.requestDevice()
}

class Grid {
	readonly uniformBuffer: GPUBuffer

	constructor(
		readonly size: number,
		device: GPUDevice,
	) {
		const data = new Float32Array([size, size])
		this.uniformBuffer = device.createBuffer({
			label: "Grid Uniform",
			size: data.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(this.uniformBuffer, 0, data)
	}
}

class Buffers {
	static createTimeBuffer(device: GPUDevice): GPUBuffer {
		return device.createBuffer({
			label: "Time Uniform",
			size: 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})
	}

	static createVertexBuffer(device: GPUDevice): [GPUBuffer, Float32Array] {
		const data = new Float32Array([
			-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
		])
		const buffer = device.createBuffer({
			label: "Cell vertices",
			size: data.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(buffer, 0, data)
		return [buffer, data]
	}

	static createStateBuffers(device: GPUDevice, size: number): GPUBuffer[] {
		const data = new Uint32Array(size * size).map(() =>
			Math.random() > 0.6 ? 1 : 0,
		)
		const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		const buffers = [
			device.createBuffer({ label: "State A", size: data.byteLength, usage }),
			device.createBuffer({ label: "State B", size: data.byteLength, usage }),
		]
		device.queue.writeBuffer(buffers[0], 0, data)
		device.queue.writeBuffer(buffers[1], 0, data)
		return buffers
	}
}

class PipelineFactory {
	static createBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
		return device.createBindGroupLayout({
			label: "BindGroupLayout",
			entries: [
				{ binding: 0, visibility: 7, buffer: { type: "uniform" } },
				{ binding: 1, visibility: 2, buffer: { type: "uniform" } },
				{ binding: 2, visibility: 5, buffer: { type: "read-only-storage" } },
				{ binding: 3, visibility: 4, buffer: { type: "storage" } },
			],
		})
	}

	static createPipelineLayout(device: GPUDevice, layout: GPUBindGroupLayout) {
		return device.createPipelineLayout({ bindGroupLayouts: [layout] })
	}

	static async createCompute(
		device: GPUDevice,
		layout: GPUPipelineLayout,
	): Promise<GPUComputePipeline> {
		const module = device.createShaderModule({
			label: "Compute shader",
			code: (await import("./shaders/simulation.wgsl?raw")).default,
		})
		return device.createComputePipeline({
			label: "Simulation pipeline",
			layout,
			compute: { module, entryPoint: "computeMain" },
		})
	}

	static async createRender(
		device: GPUDevice,
		format: GPUTextureFormat,
		layout: GPUPipelineLayout,
	): Promise<GPURenderPipeline> {
		const module = device.createShaderModule({
			label: "Cell shader",
			code: (await import("./shaders/cell.wgsl?raw")).default,
		})
		return device.createRenderPipeline({
			label: "Cell pipeline",
			layout,
			vertex: {
				module,
				entryPoint: "vertexMain",
				buffers: [
					{
						arrayStride: 8,
						attributes: [{ format: "float32x2", offset: 0, shaderLocation: 0 }],
					},
				],
			},
			fragment: {
				module,
				entryPoint: "fragmentMain",
				targets: [{ format }],
			},
		})
	}
}

class Simulation {
	public bindGroups: GPUBindGroup[]
	private stateBuffers: GPUBuffer[]

	constructor(
		private device: GPUDevice,
		grid: Grid,
		private time: GPUBuffer,
		state: GPUBuffer[],
		layout: GPUBindGroupLayout,
	) {
		this.stateBuffers = state
		this.bindGroups = this.createBindGroups(grid, layout)
	}

	reset(size: number) {
		const data = new Uint32Array(size * size).map(() =>
			Math.random() > 0.6 ? 1 : 0,
		)
		for (const buffer of this.stateBuffers) {
			this.device.queue.writeBuffer(buffer, 0, data)
		}
	}

	private createBindGroups(
		grid: Grid,
		layout: GPUBindGroupLayout,
	): GPUBindGroup[] {
		return [
			this.device.createBindGroup({
				layout,
				entries: [
					{ binding: 0, resource: { buffer: grid.uniformBuffer } },
					{ binding: 1, resource: { buffer: this.time } },
					{ binding: 2, resource: { buffer: this.stateBuffers[0] } },
					{ binding: 3, resource: { buffer: this.stateBuffers[1] } },
				],
			}),
			this.device.createBindGroup({
				layout,
				entries: [
					{ binding: 0, resource: { buffer: grid.uniformBuffer } },
					{ binding: 1, resource: { buffer: this.time } },
					{ binding: 2, resource: { buffer: this.stateBuffers[1] } },
					{ binding: 3, resource: { buffer: this.stateBuffers[0] } },
				],
			}),
		]
	}
}

class Renderer {
	private lastFrame = 0
	private frameCount = 0
	private fps = 0
	private bindGroupIndex = 0
	private lastSwitch = 0

	constructor(
		private device: GPUDevice,
		private context: GPUCanvasContext,
		private renderPipeline: GPURenderPipeline,
		private computePipeline: GPUComputePipeline,
		private vertexBuffer: GPUBuffer,
		private vertices: Float32Array,
		private simulation: Simulation,
		private timeBuffer: GPUBuffer,
	) {}

	render(timeMs: number) {
		this.updateFPS(timeMs)

		const encoder = this.device.createCommandEncoder()
		this.runComputePass(encoder, timeMs)
		this.runRenderPass(encoder)
		this.updateTimeBuffer(timeMs)

		this.device.queue.submit([encoder.finish()])
		requestAnimationFrame(this.render.bind(this))
	}

	private updateFPS(timeMs: number) {
		if (!this.lastFrame) this.lastFrame = timeMs
		this.frameCount++

		if (timeMs - this.lastFrame >= 1000) {
			this.fps = this.frameCount
			this.frameCount = 0
			this.lastFrame = timeMs
			document.querySelector("#fps")!.textContent = `FPS: ${this.fps}`
		}
	}

	private updateTimeBuffer(timeMs: number) {
		const seconds = timeMs / 1000
		this.device.queue.writeBuffer(
			this.timeBuffer,
			0,
			new Float32Array([seconds]),
		)
	}

	private runComputePass(encoder: GPUCommandEncoder, timeMs: number) {
		if (timeMs - this.lastSwitch >= COMPUTE_MS_INTERVAL) {
			this.bindGroupIndex = (this.bindGroupIndex + 1) % 2
			this.lastSwitch = timeMs
		}
		const pass = encoder.beginComputePass()
		pass.setPipeline(this.computePipeline)
		pass.setBindGroup(0, this.simulation.bindGroups[this.bindGroupIndex])
		pass.dispatchWorkgroups(Math.ceil(GRID_SIZE / 8), Math.ceil(GRID_SIZE / 8))
		pass.end()
	}

	private runRenderPass(encoder: GPUCommandEncoder) {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.context.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: [0.0, 0.0, 0.4, 1],
					storeOp: "store",
				},
			],
		})
		pass.setPipeline(this.renderPipeline)
		pass.setVertexBuffer(0, this.vertexBuffer)
		pass.setBindGroup(0, this.simulation.bindGroups[this.bindGroupIndex])
		pass.draw(this.vertices.length / 2, GRID_SIZE * GRID_SIZE)
		pass.end()
	}
}

class Engine {
	private simulation!: Simulation
	private renderer!: Renderer
	private animationFrameId: number | null = null

	async start() {
		UIController.setup()
		const device = await getDevice()
		const canvas = await getCanvas()
		const context = canvas.getContext("webgpu")!
		const format = navigator.gpu.getPreferredCanvasFormat()
		context.configure({ device, format })

		this.init(device, context, format, GRID_SIZE)

		UIController.onReset(() => this.simulation.reset(GRID_SIZE))
		UIController.onGridSizeChange((newSize) => {
			this.stopRendering()
			GRID_SIZE = newSize
			this.init(device, context, format, newSize)
		})
	}

	private stopRendering() {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
	}

	private async init(
		device: GPUDevice,
		context: GPUCanvasContext,
		format: GPUTextureFormat,
		gridSize: number,
	) {
		const grid = new Grid(gridSize, device)
		const timeBuffer = Buffers.createTimeBuffer(device)
		const [vertexBuffer, vertices] = Buffers.createVertexBuffer(device)
		const stateBuffers = Buffers.createStateBuffers(device, gridSize)
		const layout = PipelineFactory.createBindGroupLayout(device)
		const pipelineLayout = PipelineFactory.createPipelineLayout(device, layout)

		const [renderPipeline, computePipeline] = await Promise.all([
			PipelineFactory.createRender(device, format, pipelineLayout),
			PipelineFactory.createCompute(device, pipelineLayout),
		])

		this.simulation = new Simulation(
			device,
			grid,
			timeBuffer,
			stateBuffers,
			layout,
		)
		this.renderer = new Renderer(
			device,
			context,
			renderPipeline,
			computePipeline,
			vertexBuffer,
			vertices,
			this.simulation,
			timeBuffer,
		)

		this.animationFrameId = requestAnimationFrame(
			this.renderer.render.bind(this.renderer),
		)
	}
}

new Engine().start().catch(console.error)
