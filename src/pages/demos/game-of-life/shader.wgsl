struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f
};

// Render-stage resources
@group(0) @binding(0) var renderTexture: texture_storage_2d<r32uint, read>;

struct Colors {
    aliveCol: vec4f, // w component unused, but padding requires vec4
    deadCol: vec4f,
}

@group(0) @binding(1) var<uniform> colors: Colors;

@group(1) @binding(0) var computeTextureSrc: texture_storage_2d<r32uint, read>;
@group(1) @binding(1) var computeTextureDst: texture_storage_2d<r32uint, read_write>;


@vertex
fn vs(@builtin(vertex_index) vidx : u32) -> VSOut {
    var out : VSOut;
    let quad = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );
    let v = quad[vidx];
    // Scale quad to preserve aspect ratio, then convert to clip space
    let scaled = v * vec2f(ScaleX, ScaleY);
    out.pos = vec4f(scaled, 0.0, 1.0);
    // Map scaled clip space back to [0, 1] for sampling
    // scaled is in [-scaleX, scaleX] × [-scaleY, scaleY]
    // center it and clamp to board area
    let centered = (scaled + vec2f(ScaleX, ScaleY)) / vec2f(2.0 * ScaleX, 2.0 * ScaleY);
    out.uv = centered;
    out.uv.y = 1.0 - out.uv.y;
    return out;
}

@fragment
fn fs(@location(0) uv : vec2f) -> @location(0) vec4f {
    let x = u32(floor(uv.x * f32(BoardWidth)));
    let y = u32(floor(uv.y * f32(BoardHeight)));
    let cellState = textureLoad(renderTexture, vec2u(x, y)).x;
    if (cellState == 1u) {
        return vec4f(colors.aliveCol.xyz, 1.0);
    }
    return vec4f(colors.deadCol.xyz, 1.0);
}


@compute @workgroup_size(
    WorkGroupSize,
    WorkGroupSize,
    1
) fn main(@builtin(global_invocation_id) id : vec3<u32>) {
    let idx = id.xy;
    var neighborCount : u32 = 0u;

    for (var y: i32 = -1; y <= 1; y+= 1) {
        for (var x: i32 = -1; x <= 1; x+= 1) {
            if (x == 0 && y == 0) {
                continue;
            }
            let neighborY = (i32(id.y) + y + i32(BoardHeight)) % i32(BoardHeight);
            let neighborX = (i32(id.x) + x + i32(BoardWidth)) % i32(BoardWidth);
            let neighborIdx = vec2<u32>(u32(neighborX), u32(neighborY));
            neighborCount += textureLoad(computeTextureSrc, neighborIdx).x;
        }
    }

    var newState : u32 = 0u;
    if (neighborCount == 3u) {
        newState = 1u;
    } else if (neighborCount == 2u) {
        newState = textureLoad(computeTextureSrc, idx).x;
    }
    textureStore(computeTextureDst, idx, vec4<u32>(newState, 0u, 0u, 0u));
}