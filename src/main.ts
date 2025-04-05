import "./style.css"

async function init() {
	const canvas = document.querySelector<HTMLCanvasElement>("#canvas")
	if (!canvas) {
		throw new Error("Canvas element not found")
	}
	if (!navigator.gpu) {
		throw new Error("WebGPU not supported on this browser.")
	}

	const adapter = await navigator.gpu.requestAdapter()
	if (!adapter) {
		throw new Error("No appropriate GPUAdapter found.")
	}

	const context = canvas.getContext("webgpu")
	if (!context) {
		throw new Error("Failed to get WebGPU context.")
	}

	const device = await adapter.requestDevice()
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
	context.configure({ device, format: canvasFormat })

	const encoder = device.createCommandEncoder()

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [
			{
				format: "float32x2" as GPUVertexFormat,
				offset: 0,
				shaderLocation: 0,
			},
		],
	}
	const cellShaderModule = device.createShaderModule({
		label: "Cell shader",
		code: (await import("./shaders/cell.wgsl?raw")).default,
	})
	const cellPipeline = device.createRenderPipeline({
		label: "Cell pipeline",
		layout: "auto",
		vertex: {
			module: cellShaderModule,
			entryPoint: "vertexMain",
			buffers: [vertexBufferLayout],
		},
		fragment: {
			module: cellShaderModule,
			entryPoint: "fragmentMain",
			targets: [{ format: canvasFormat }],
		},
	})

	const vertices = new Float32Array([
		-0.8, -0.8, 0.8, -0.8, 0.8, 0.8, -0.8, -0.8, 0.8, 0.8, -0.8, 0.8,
	])
	const vertexBuffer = device.createBuffer({
		label: "Cell vertices",
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	})
	device.queue.writeBuffer(vertexBuffer, 0, vertices)

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view: context.getCurrentTexture().createView(),
				loadOp: "clear",
				clearValue: [0.0, 0.0, 0.4, 1.0],
				storeOp: "store",
			},
		],
	})
	pass.setPipeline(cellPipeline)
	pass.setVertexBuffer(0, vertexBuffer)
	pass.draw(vertices.length / 2)
	pass.end()
	device.queue.submit([encoder.finish()])
}

init().catch((error) => {
	console.error("Failed to initialize the application:", error)
})
