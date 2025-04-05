@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<uniform> time: f32;

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
    let cellOffset = cell / grid * 2.0;
    let gridPos = (input.pos + 1.0) / grid - 1.0 + cellOffset;

    var output: VertexOutput;
    output.pos = vec4f(gridPos, 0.0, 1.0);
    output.cell = cell;
    return output;
}

fn hueToRGB(hue: f32) -> vec3f {
    let r = 0.5 + 0.5 * sin(6.28318 * (hue + 0.0));
    let g = 0.5 + 0.5 * sin(6.28318 * (hue + 0.33));
    let b = 0.5 + 0.5 * sin(6.28318 * (hue + 0.66));
    return vec3f(r, g, b);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let center = grid * 0.5;
    let delta = input.cell - center;
    let angle = atan2(delta.y, delta.x);
    let normalizedAngle = (angle / (2.0 * 3.14159)) + 0.5;

    let speed = 0.3;
    let hue = fract(normalizedAngle + time * speed);
    let color = hueToRGB(hue);
    return vec4f(color, 1.0);
}
