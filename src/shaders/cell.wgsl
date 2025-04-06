@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> time: f32;
@group(0) @binding(2) var<storage> cellState: array<u32>;

const TAU: f32 = 6.28318530718;

struct VertexInput {
	@location(0) pos: vec2f,
	@builtin(instance_index) instance: u32,
};

struct VertexOutput {
	@builtin(position) pos: vec4f,
	@location(0) cell: vec2f,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
	let i = f32(input.instance);
	let cell = vec2f(i % grid.x, floor(i / grid.x));
	let state = f32(cellState[input.instance]);

	let cellOffset = cell / grid * 2.0;
	let gridPos = (input.pos * state + 1.0) / grid - 1.0 + cellOffset;

	var output: VertexOutput;
	output.pos = vec4f(gridPos, 0.0, 1.0);
	output.cell = cell;
	return output;
}

fn hueToRGB(hue: f32) -> vec3f {
	return 0.5 + 0.5 * sin(TAU * (vec3f(hue) + vec3f(0.0, 0.33, 0.66)));
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
	let delta = input.cell - grid * 0.5;
	let angle = atan2(delta.y, delta.x);
	let normalizedAngle = (angle / TAU) + 0.5;
	let hue = fract(normalizedAngle + time * 0.3);
	return vec4f(hueToRGB(hue), 1.0);
}
