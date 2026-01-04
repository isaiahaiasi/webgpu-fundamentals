struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) fragCoord: vec2f
};

@group(0) @binding(0) var<storage, read> readBuffer : array<u32>;
@group(0) @binding(1) var<storage, read_write> writeBuffer : array<u32>;

@vertex
fn vs_main(@location(0) inPos : vec2f) -> VSOut {
    var out : VSOut;
    out.pos = vec4f(inPos, 0.0, 1.0);
    out.fragCoord = inPos * 0.5 + 0.5;
    return out;
}

// Todo: move to file & use string interpolation to set (instead of adding uniform).
// Todo: (do the same for workgroup size in compute shader)
// Todo: split board size into width and height.
const BoardSize : u32 = 128;

@fragment
fn fs(@location(0) pos : vec2f) -> @location(0) vec4f {
    let index = vec2u(pos * f32(BoardSize));
    let value = readBuffer[index.y * BoardSize + index.x];
    if (value == 1u) {
        return vec4f(1.0, 1.0, 1.0, 1.0);
    } else {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
}

@compute @workgroup_size(8, 8, 1) fn cs(@builtin(global_invocation_id) id : vec3<u32>) {
    let idx = id.y * u32(BoardSize) + id.x;
    writeBuffer[idx] = readBuffer[idx];
}
